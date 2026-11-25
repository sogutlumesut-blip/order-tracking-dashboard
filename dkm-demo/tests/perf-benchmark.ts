// DKM Takip DEMO - Gerçek Performans ve Kapasite Testi (npm run demo:perf)
// - 10, 30, 50 ve 100 siparişlik kuyruk testleri
// - 1 worker vs 2 worker vs 4 worker karşılaştırmalı gerçek alt süreç (multi-process) testi
// - 5-10 GB gerçek PSB dosyası desteği (--large-gb=5 veya --large-gb=10; disk alanı yetersizse sahte sonuç üretmez, açıkça raporlar)
// - Raporlanan metrikler: taslak başına süre, ortalama süre, maks RAM, CPU, disk, kaynak/ağ IO, başarılı/başarısız sayı, worker kapasitesi.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { DEMO_APP_DIR, REPO_ROOT } from "../src/config.ts";
import { openDb, initDefaultSettings, setSetting } from "../src/db.ts";
import { enqueueDraftJob } from "../src/queue.ts";
import { writePsd } from "../src/fixtures/psd-writer.ts";
import { probeSource, ensureWorkImage, ensureProxy, computePpi, defaultCrop, renderPreview, renderDetail } from "../src/engine/index.ts";

const designsDir = path.join(REPO_ROOT, "DKM_DEMO", "DESIGNS");
const logsDir = path.join(REPO_ROOT, "DKM_DEMO", "LOGS");
fs.mkdirSync(logsDir, { recursive: true });

const POOL_SKUS = [
  { sku: "DKM-TROPIC-01", w: 150, h: 100, u: "cm" },
  { sku: "DKM-FOREST-02", w: 180, h: 125, u: "cm" },
  { sku: "DKM-MARBLE-03", w: 2.1, h: 1.4, u: "m" },
  { sku: "DKM-GEO-04", w: 1400, h: 1050, u: "mm" },
  { sku: "DKM-BOTANIC-05", w: 60, h: 45, u: "in" },
  { sku: "DKM-ARCH-06", w: 4.5, h: 3.3, u: "ft" },
  { sku: "DKM-SAND-07", w: 170, h: 115, u: "cm" },
  { sku: "DKM-KIDS-08", w: 140, h: 95, u: "cm" },
  { sku: "DKM-VINTAGE-09", w: 190, h: 125, u: "cm" },
  { sku: "DKM-GOLD-10", w: 160, h: 105, u: "cm" },
];

function dirSizeBytes(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) total += dirSizeBytes(full);
    else total += fs.statSync(full).size;
  }
  return total;
}

function cpuSnapshot() {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    const t = c.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

function pct(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

interface BenchResult {
  queueSize: number;
  workers: number;
  wallMs: number;
  succeeded: number;
  failed: number;
  avgDraftMs: number;
  minDraftMs: number;
  p50DraftMs: number;
  p95DraftMs: number;
  maxDraftMs: number;
  peakRssMb: number;
  cpuPercent: number;
  diskWrittenMb: number;
  networkIoMb: number;
  capacityPerMin: number;
  capacityPerHour: number;
}

async function runQueueBench(queueSize: number, workers: number): Promise<BenchResult> {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), `dkm-perf-${queueSize}x${workers}-`));
  const dbPath = path.join(tmpRoot, "perf.sqlite");
  const envFile = path.join(tmpRoot, ".env.demo");
  fs.writeFileSync(
    envFile,
    `DKM_ENV=demo\nDKM_DEMO_ROOT=${tmpRoot}\nDKM_DEMO_DB=${dbPath}\nDKM_DEMO_SESSION_SECRET=${crypto.randomBytes(32).toString("hex")}\n`,
  );

  const db = openDb(dbPath);
  initDefaultSettings(db, tmpRoot);
  // Salt-okunur mevcut DKM_DEMO/DESIGNS klasörünü kullan
  setSetting(db, "path_designs", designsDir);

  const ins = db.prepare(
    `INSERT INTO orders (order_no, dealer_code, source, customer, phone, total, status, labels, sku, product_name, width, height, unit)
     VALUES (?, 'DKM', 'DKM', 'Perf Test', '+90 500 000 00 00', '1000 ₺', 'draft', '[]', ?, 'Perf Ürün', ?, ?, ?)`,
  );
  const tx = db.transaction(() => {
    for (let i = 0; i < queueSize; i++) {
      const tpl = POOL_SKUS[i % POOL_SKUS.length];
      const r = ins.run(`PERF-${queueSize}-${workers}-${i + 1}`, tpl.sku, tpl.w, tpl.h, tpl.u);
      enqueueDraftJob(db, Number(r.lastInsertRowid), { actor: "Perf", autoSendWhatsApp: true });
    }
  });
  tx();

  const workerScript = path.join(DEMO_APP_DIR, "src", "worker.ts");
  const cpuBefore = cpuSnapshot();
  const t0 = Date.now();

  await Promise.all(
    Array.from({ length: workers }, (_, idx) => {
      return new Promise<void>((resolve, reject) => {
        const ch = spawn(process.execPath, [workerScript, "--once"], {
          env: {
            ...process.env,
            DKM_ENV_FILE: envFile,
            DKM_WORKER_ID: `perf-w${idx + 1}`,
          },
          stdio: "ignore",
        });
        ch.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`worker ${idx + 1} exit ${code}`))));
        ch.on("error", reject);
      });
    }),
  );

  const wallMs = Date.now() - t0;
  const cpuAfter = cpuSnapshot();
  const dTotal = Math.max(1, cpuAfter.total - cpuBefore.total);
  const dIdle = cpuAfter.idle - cpuBefore.idle;
  const cpuPercent = Number((((dTotal - dIdle) / dTotal) * 100).toFixed(1));

  const jobs = db.prepare("SELECT status, duration_ms, peak_rss_bytes, bytes_read FROM jobs").all() as any[];
  const succeeded = jobs.filter((j) => j.status === "done").length;
  const failed = jobs.filter((j) => j.status !== "done").length;
  const durs = jobs.map((j) => Number(j.duration_ms || 0)).sort((a, b) => a - b);
  const avgDraftMs = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0;
  const peakRssBytes = jobs.reduce((m, j) => Math.max(m, Number(j.peak_rss_bytes || 0)), 0);
  const totalBytesRead = jobs.reduce((s, j) => s + Number(j.bytes_read || 0), 0);
  const diskWrittenBytes =
    dirSizeBytes(path.join(tmpRoot, "PREVIEWS")) +
    dirSizeBytes(path.join(tmpRoot, "DETAILS")) +
    dirSizeBytes(path.join(tmpRoot, "CACHE"));

  const capacityPerMin = Number(((succeeded / (wallMs / 1000)) * 60).toFixed(1));
  const capacityPerHour = Math.round(capacityPerMin * 60);

  db.close();
  fs.rmSync(tmpRoot, { recursive: true, force: true });

  return {
    queueSize,
    workers,
    wallMs,
    succeeded,
    failed,
    avgDraftMs,
    minDraftMs: durs[0] || 0,
    p50DraftMs: pct(durs, 50),
    p95DraftMs: pct(durs, 95),
    maxDraftMs: durs[durs.length - 1] || 0,
    peakRssMb: Number((peakRssBytes / 1024 / 1024).toFixed(1)),
    cpuPercent,
    diskWrittenMb: Number((diskWrittenBytes / 1024 / 1024).toFixed(1)),
    networkIoMb: Number((totalBytesRead / 1024 / 1024).toFixed(1)),
    capacityPerMin,
    capacityPerHour,
  };
}

async function runLargePsbTest(targetGb: number) {
  const st = fs.statfsSync(os.tmpdir());
  const freeGb = (st.bavail * st.bsize) / 1024 ** 3;
  // Yazılacak PSB + geçici ara TIFF için güvenli boş alan kontrolü
  const neededGb = targetGb + 1.5;
  if (freeGb < neededGb) {
    return {
      executed: false,
      requestedGb: targetGb,
      freeDiskGb: Number(freeGb.toFixed(2)),
      reason: `Yetersiz boş disk alanı: ${freeGb.toFixed(2)} GB boş, ${targetGb} GB PSB testi için en az ${neededGb.toFixed(1)} GB gerekir. Diskte yer açıldığında '--large-gb=${targetGb}' parametresiyle çalıştırılabilir.`,
    };
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dkm-large-psb-"));
  const psbPath = path.join(tmpRoot, `LARGE-${targetGb}GB.psb`);
  // targetGb GB ham 3-kanallı PSB boyutu hesapla
  const targetBytes = Math.floor(targetGb * 1024 ** 3);
  const W = 24000;
  const H = Math.max(1000, Math.floor(targetBytes / (W * 3)));
  const rowBuf = Buffer.alloc(W * 3);
  for (let x = 0; x < W; x++) {
    rowBuf[x * 3] = (x * 5) & 255;
    rowBuf[x * 3 + 1] = ((x >> 2) + 80) & 255;
    rowBuf[x * 3 + 2] = 160;
  }

  const tw0 = Date.now();
  const written = await writePsd(psbPath, {
    version: 2,
    width: W,
    height: H,
    colorMode: 3,
    depth: 8,
    compression: 0,
    ppi: 150,
    hasRealMergedData: true,
    rgbRow: (_y, out) => rowBuf.copy(out),
  });
  const writeMs = Date.now() - tw0;

  const tp0 = Date.now();
  const info = await probeSource(psbPath);
  const work = await ensureWorkImage(info, path.join(tmpRoot, "CACHE"));
  const proxy = await ensureProxy(info, work, path.join(tmpRoot, "CACHE"));
  const dim = { width: 400, height: Math.round((400 * H) / W), unit: "cm" as const };
  const crop = defaultCrop(info.width, info.height, dim.width / dim.height);
  const ppi = computePpi(crop, dim);
  await renderPreview(info, work, proxy, crop, ppi, { orderNo: "LARGE-1", sku: "LARGE-PSB", version: 1, dim }, path.join(tmpRoot, "prev.jpg"));
  await renderDetail(info, work, crop, ppi, path.join(tmpRoot, "det.jpg"));
  const processMs = Date.now() - tp0;
  const peakRssMb = Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1));

  fs.rmSync(tmpRoot, { recursive: true, force: true });
  return {
    executed: true,
    requestedGb: targetGb,
    actualFileGb: Number((written.bytes / 1024 ** 3).toFixed(2)),
    dimensionsPx: `${W}×${H}`,
    writeMs,
    processMs,
    effectivePpi: Number(ppi.effectivePpi.toFixed(1)),
    peakRssMb,
  };
}

async function main() {
  console.log("\n=== DKM TAKİP DEMO — PERFORMANS VE KAPASİTE TESTİ ===\n");
  console.log(`Donanım: ${os.cpus()[0]?.model || "?"} (${os.cpus().length} çekirdek), RAM: ${(os.totalmem() / 1024 ** 3).toFixed(1)} GB`);
  const st = fs.statfsSync(os.tmpdir());
  console.log(`Boş Disk Alanı: ${((st.bavail * st.bsize) / 1024 ** 3).toFixed(2)} GB\n`);

  const queueSizes = [10, 30, 50, 100];
  const workerCounts = [1, 2, 4];
  const benchResults: BenchResult[] = [];

  for (const w of workerCounts) {
    console.log(`--- ${w} WORKER TESTLERİ ---`);
    for (const q of queueSizes) {
      const r = await runQueueBench(q, w);
      benchResults.push(r);
      console.log(
        `  Kuyruk=${String(q).padStart(3)} | Worker=${w} | Toplam=${(r.wallMs / 1000).toFixed(2)}s | ` +
          `Ort=${r.avgDraftMs}ms (p95=${r.p95DraftMs}ms) | Başarılı=${r.succeeded}/${q} | ` +
          `PeakRAM=${r.peakRssMb}MB | CPU=${r.cpuPercent}% | Disk=${r.diskWrittenMb}MB | IO=${r.networkIoMb}MB | ` +
          `Kapasite=${r.capacityPerMin} taslak/dk (${r.capacityPerHour}/saat)`,
      );
    }
    console.log("");
  }

  // Büyük PSB testi: --large-gb=5 parametresi verilirse o boyutu dener, varsayılan olarak 5 GB kontrol eder ve güvenli disk varsa 1 GB + 5 GB dener
  const largeArg = process.argv.find((a) => a.startsWith("--large-gb="));
  const requestedGb = largeArg ? Number(largeArg.split("=")[1]) : 5;
  const large5Gb = await runLargePsbTest(requestedGb);
  console.log("--- BÜYÜK PSB (5-10 GB) AKIŞLI İŞLEME TESTİ ---");
  if (large5Gb.executed) {
    console.log(`  ✅ ${large5Gb.actualFileGb} GB PSB (${large5Gb.dimensionsPx}) işlendi: ${large5Gb.processMs}ms, PeakRAM=${large5Gb.peakRssMb}MB`);
  } else {
    console.log(`  ⚠️ ${requestedGb} GB PSB testi çalıştırılmadı: ${large5Gb.reason}`);
  }

  // Boş disk alanına sığan 0.5 GB gerçek PSB akış testi (disk güvenliğini koruyarak)
  const safeLarge = await runLargePsbTest(0.5);
  if (safeLarge.executed) {
    console.log(
      `  ✅ Güvenli disk sınırında gerçek büyük PSB testi (${safeLarge.actualFileGb} GB, ${safeLarge.dimensionsPx}): ` +
        `İşlem=${safeLarge.processMs}ms, Efektif PPI=${safeLarge.effectivePpi}, PeakRAM=${safeLarge.peakRssMb}MB`,
    );
  }

  const report = {
    runAt: new Date().toISOString(),
    hardware: {
      cpu: os.cpus()[0]?.model,
      cores: os.cpus().length,
      ramGb: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
      freeDiskGb: Number(((st.bavail * st.bsize) / 1024 ** 3).toFixed(2)),
    },
    queueBenchmarks: benchResults,
    largeFile5GbTest: large5Gb,
    safeLargePsbTest: safeLarge,
  };
  const outPath = path.join(logsDir, "performance-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nRapor kaydedildi: ${outPath}\n`);
}

main().catch((e) => {
  console.error("[perf] Hata:", e);
  process.exit(1);
});
