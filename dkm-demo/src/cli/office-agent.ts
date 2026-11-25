// DKM Takip — Ofis Worker Ajanı (npm run office:agent)
// Ofis içindeki Windows Server (2.98 TB Katalog Baskı) ile buluttaki https://dkmtakip.online arasında
// güvenli, salt-okunur outbound HTTPS köprüsü kurar. Port açma veya VPN gerektirmez.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { execFile } from "node:child_process";
import { pipeline } from "node:stream/promises";
import sharp from "sharp";
import { REPO_ROOT } from "../config.ts";
import {
  probeSource,
  ensureWorkImage,
  ensureProxy,
  defaultCrop,
  validateCrop,
  computePpi,
  renderPreview,
  renderDetail,
  renderPrint,
  computeTilePpi,
  renderTiledPreview,
  renderTiledDetail,
  renderTiledPrint,
  DEFAULT_ENGINE,
  SUPPORTED_EXTS,
} from "../engine/index.ts";
import type { Crop, EngineSettings, TileConfig } from "../engine/index.ts";
import { findDesignBySku, validateSku } from "../engine/sku-finder.ts";
import { parseDimensionString, toInches, formatDim } from "../engine/units.ts";
import { EngineError, toEngineError } from "../engine/errors.ts";
import { fetchCustomDesignToCache, findCustomDesignUrl } from "../engine/drive-fetch.ts";
import { computeVisualSignature } from "../engine/visual-hash.ts";

const CLOUD_URL = (process.env.DKM_CLOUD_URL || "https://dkmtakip.online").replace(/\/$/, "");
const AGENT_TOKEN = (process.env.DKM_AGENT_TOKEN || "").trim();
const DEFAULT_SERVER_PATH = (process.env.DKM_SERVER_PATH || "").trim();
const OUT_ROOT = path.resolve(process.env.DKM_OFFICE_OUT || path.join(REPO_ROOT, "DKM_OFFICE_OUT"));
const HOSTNAME = os.hostname();

if (!AGENT_TOKEN) {
  console.error("❌ DKM_AGENT_TOKEN gerekli! Ayarlar > Server Bağlantı Ayarları sayfasından komutu kopyalayıp çalıştırın.");
  process.exit(1);
}

for (const sub of ["PREVIEWS", "DETAILS", "APPROVED", "PRINT_READY", "CACHE"]) {
  fs.mkdirSync(path.join(OUT_ROOT, sub), { recursive: true });
}

const headers = {
  Authorization: `Bearer ${AGENT_TOKEN}`,
  "Content-Type": "application/json",
};

function cpuSnap() {
  let idle = 0, total = 0;
  for (const c of os.cpus()) {
    const t = c.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

async function compressForCloud(filePath: string, maxPx: number, quality = 80): Promise<string> {
  const buf = await sharp(filePath).resize(maxPx, maxPx, { fit: "inside", withoutEnlargement: true }).jpeg({ quality }).toBuffer();
  return buf.toString("base64");
}

async function handleTestConnection(serverPath: string) {
  const target = (serverPath || DEFAULT_SERVER_PATH).trim();
  if (!target) return { ok: false, configured: false, error: "Server klasör yolu girilmedi." };
  const resolved = path.resolve(target);
  try {
    const st = await fs.promises.stat(resolved);
    if (!st.isDirectory()) return { ok: false, path: resolved, error: "Girilen yol bir klasör değil." };
    await fs.promises.access(resolved, fs.constants.R_OK);
    const entries = await fs.promises.readdir(resolved, { withFileTypes: true });
    const visible = entries.filter((e) => !e.name.startsWith(".") && !e.name.startsWith("~$"));
    return {
      ok: true,
      configured: true,
      readOnlyMode: true,
      viaOfficeAgent: HOSTNAME,
      path: resolved,
      topLevelCount: visible.length,
    };
  } catch (e: any) {
    return { ok: false, path: resolved, error: `Ofis ajanından klasöre erişilemedi (${e?.code || e?.message})` };
  }
}

async function handleSearchSku(serverPath: string, sku: string, engSettings: EngineSettings) {
  const target = (serverPath || DEFAULT_SERVER_PATH).trim();
  if (!target) return { ok: false, error: "Server klasör yolu yapılandırılmadı.", matches: [] };
  try {
    const filePath = await findDesignBySku(target, sku);
    const info = await probeSource(filePath, engSettings);
    return {
      ok: true,
      source: `office_agent (${HOSTNAME})`,
      configuredPath: target,
      matches: [
        {
          sku,
          filePath,
          fileName: path.basename(filePath),
          format: info.format.toUpperCase(),
          sizeBytes: info.sizeBytes,
          widthPx: info.width,
          heightPx: info.height,
          colorSpace: info.space,
          depth: info.depth,
        },
      ],
    };
  } catch (e: any) {
    return { ok: false, code: e?.code || "DESIGN_NOT_FOUND", error: e?.message || "Bulunamadı", matches: [] };
  }
}

async function handleIndexServer(serverPath: string, engSettings: EngineSettings) {
  const target = (serverPath || DEFAULT_SERVER_PATH).trim();
  const conn = await handleTestConnection(target);
  if (!conn.ok) throw new Error(conn.error || "Server bağlantısı yok");
  const rootDir = conn.path!;
  const t0 = Date.now();
  const allFiles: { full: string; name: string; ext: string; skuStem: string }[] = [];

  async function walk(dir: string, depth: number) {
    if (depth > 8) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".") || ent.name.startsWith("~$")) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) await walk(full, depth + 1);
      else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (!SUPPORTED_EXTS.includes(ext)) continue;
        allFiles.push({ full, name: ent.name, ext, skuStem: path.basename(ent.name, ext).trim() });
      }
    }
  }
  await walk(rootDir, 0);
  console.log(`[agent] İndeksleniyor: ${allFiles.length} dosya (${rootDir})...`);

  const entries: any[] = [];
  let cursor = 0;
  let done = 0;
  const worker = async () => {
    while (cursor < allFiles.length) {
      const f = allFiles[cursor++];
      try {
        const st = await fs.promises.stat(f.full);
        // 2.98 TB SMB arşivinde hızlı indeksleme: 30 MB altı dosyalarda görsel parmak izi + boyut, büyüklerde hızlı başlık okuma
        let widthPx: number | null = null;
        let heightPx: number | null = null;
        let colorSpace: string | null = null;
        let depth: string | null = null;
        let visualHash: string | null = null;
        let format = f.ext.replace(".", "").toUpperCase();
        if (st.size <= 30 * 1024 * 1024) {
          try {
            const info = await probeSource(f.full, engSettings);
            format = info.format.toUpperCase();
            widthPx = info.width;
            heightPx = info.height;
            colorSpace = info.space;
            depth = info.depth;
            if (["jpeg", "png", "tiff"].includes(info.format)) {
              visualHash = await computeVisualSignature(f.full);
            }
          } catch {}
        }
        entries.push({
          sku: f.skuStem,
          filePath: f.full,
          fileName: f.name,
          format,
          sizeBytes: st.size,
          widthPx,
          heightPx,
          colorSpace,
          depth,
          visualHash,
          mtimeMs: st.mtimeMs,
        });
      } catch {}
      done++;
      if (done % 250 === 0 || done === allFiles.length) {
        console.log(`[agent] İndeks ilerleme: ${done}/${allFiles.length}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, () => worker()));
  console.log(`[agent] İndeksleme bitti: ${entries.length} dosya (${Date.now() - t0}ms)`);
  return { entries, result: { ok: true, indexedCount: entries.length, durationMs: Date.now() - t0 } };
}

async function handleGenerateDraft(order: any, payload: any, settings: any, skuMappings: any[], prevDraft?: any) {
  const t0 = Date.now();
  const cpu0 = cpuSnap();
  let peakRss = process.memoryUsage().rss;
  const engSettings: EngineSettings = {
    ...DEFAULT_ENGINE,
    minPpi: settings.minPpi || DEFAULT_ENGINE.minPpi,
    warnPpi: settings.warnPpi || DEFAULT_ENGINE.warnPpi,
    printPpiMax: settings.printPpiMax || DEFAULT_ENGINE.printPpiMax,
    maxFileBytes: Math.max(1, settings.maxFileGb || 12) * 1024 ** 3,
  };

  const item = order?.items?.[0];
  const rawSku = String(payload.overrideSku ?? item?.sku ?? "").trim();
  const rawDim = String(payload.overrideDimensions ?? item?.dimensions ?? "").trim();
  const serverPath = (settings.serverPath || DEFAULT_SERVER_PATH).trim();
  const customDriveUrl = findCustomDesignUrl(item);

  const isWayfair = (order.source || "").toLowerCase() === "wayfair" || (order.barcode || "").toUpperCase().startsWith("WF-");
  const dim = parseDimensionString(rawDim, isWayfair ? "in" : "cm");
  const sku = rawSku ? validateSku(rawSku) : `ORD-${order.id}`;
  const inch = toInches(dim);
  const targetAspect = inch.w / inch.h;

  const tFind0 = Date.now();
  let sourcePath: string | null = null;
  let reusedPrevSource = false;
  if (payload.overrideSourcePath && fs.existsSync(payload.overrideSourcePath)) {
    sourcePath = payload.overrideSourcePath;
  } else if (prevDraft?.sourcePath && prevDraft.sku === sku && fs.existsSync(prevDraft.sourcePath)) {
    // HIZLANDIRMA: Aynı siparişin v2/v3/v4 kırpma veya seamless düzenlemelerinde Drive/SMB aramasını atla (0 ms!)
    sourcePath = prevDraft.sourcePath;
    reusedPrevSource = true;
  } else if (customDriveUrl) {
    // Siparişte Google Drive dosya/klasör linki varsa 2.98 TB Server'ı boşuna taramadan DOĞRUDAN Drive'dan indir!
    const dl = await fetchCustomDesignToCache(customDriveUrl, path.join(OUT_ROOT, "CACHE"), {
      sku,
      accessToken: settings.gdriveAccessToken || null,
    });
    sourcePath = dl.filePath;
  } else {
    const saved = (skuMappings || []).find((m: any) => m.sku.toLowerCase() === sku.toLowerCase());
    if (saved && fs.existsSync(saved.filePath)) {
      sourcePath = saved.filePath;
    } else if (serverPath) {
      sourcePath = await findDesignBySku(serverPath, sku);
    }
  }
  if (!sourcePath) throw new EngineError("SOURCE_UNAVAILABLE", "Ofis ajanında tasarım klasörü bulunamadı.");
  const findMs = Date.now() - tFind0;

  const tRead0 = Date.now();
  const info = await probeSource(sourcePath, engSettings);
  const work = await ensureWorkImage(info, path.join(OUT_ROOT, "CACHE"), engSettings);
  const proxy = await ensureProxy(info, work, path.join(OUT_ROOT, "CACHE"), engSettings);
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
  const readMs = Date.now() - tRead0;

  const autoSeamless = /seamless|takipli|pattern|repeat/i.test(`${item?.name || ""} ${path.basename(sourcePath)}`);
  const layoutMode: "mural" | "seamless" = payload.layoutMode || (autoSeamless ? "seamless" : "mural");
  const tile: TileConfig | null =
    layoutMode === "seamless"
      ? {
          repeatWidthInch: Math.max(0.5, Number(payload.tileConfig?.repeatWidthInch || inch.w)),
          offsetX: Number(payload.tileConfig?.offsetX || 0),
          offsetY: Number(payload.tileConfig?.offsetY || 0),
          halfDrop: !!payload.tileConfig?.halfDrop,
        }
      : null;

  const crop: Crop = payload.crop
    ? validateCrop(payload.crop, info.width, info.height, targetAspect)
    : defaultCrop(info.width, info.height, targetAspect);
  const ppi = layoutMode === "seamless" && tile ? computeTilePpi(info, dim, tile, engSettings) : computePpi(crop, dim, engSettings);

  const tag = String(order.barcode || order.id).replace(/[^A-Za-z0-9_-]/g, "_");
  const stamp = Date.now();
  const previewPath = path.join(OUT_ROOT, "PREVIEWS", `ORD_${order.id}_${tag}_${stamp}_preview.jpg`);
  const detailPath = path.join(OUT_ROOT, "DETAILS", `ORD_${order.id}_${tag}_${stamp}_detail100.jpg`);

  // HIZLANDIRMA: Önizleme ve %100 Detay görsellerini PARALEL üret
  const tRender0 = Date.now();
  if (layoutMode === "seamless" && tile) {
    await Promise.all([
      renderTiledPreview(info, work, proxy, dim, tile, ppi, { orderNo: String(order.barcode || order.id), sku, version: 1, dim }, previewPath, engSettings),
      renderTiledDetail(info, work, dim, tile, ppi, detailPath, engSettings),
    ]);
  } else {
    await Promise.all([
      renderPreview(info, work, proxy, crop, ppi, { orderNo: String(order.barcode || order.id), sku, version: 1, dim }, previewPath, engSettings),
      renderDetail(info, work, crop, ppi, detailPath, engSettings, payload.detailCenter),
    ]);
  }
  const renderMs = Date.now() - tRender0;
  const totalMs = Date.now() - t0;
  peakRss = Math.max(peakRss, process.memoryUsage().rss);

  const cpu1 = cpuSnap();
  const dTotal = Math.max(1, cpu1.total - cpu0.total);
  const cpuPercent = Number((((dTotal - (cpu1.idle - cpu0.idle)) / dTotal) * 100).toFixed(1));
  const outputBytes = fs.statSync(previewPath).size + fs.statSync(detailPath).size;

  // HIZLANDIRMA: Önceki sürümden aynı kaynak kullanılıyorsa proxyData'yı tekrar yükleme (upload yarıya iner!)
  const [previewData, detailData, proxyData] = await Promise.all([
    compressForCloud(previewPath, 1280, 80),
    compressForCloud(detailPath, 900, 82),
    reusedPrevSource ? Promise.resolve(null) : compressForCloud(proxy.proxyPath, 1100, 76),
  ]);

  return {
    sku,
    dimensionsRaw: formatDim(dim),
    width: dim.width,
    height: dim.height,
    unit: dim.unit,
    sourcePath,
    sourceFileName: path.basename(sourcePath),
    sourceFormat: info.format,
    sourceWidth: info.width,
    sourceHeight: info.height,
    sourceSpace: info.space,
    sourceBytes: info.sizeBytes,
    cropX: crop.x,
    cropY: crop.y,
    cropW: crop.w,
    cropH: crop.h,
    layoutMode,
    tileConfig: tile ? JSON.stringify(tile) : null,
    effectivePpi: ppi.effectivePpi,
    outPpi: ppi.outPpi,
    ppiStatus: ppi.status,
    outWidth: ppi.outW,
    outHeight: ppi.outH,
    previewPath,
    detailPath,
    proxyPath: proxy.proxyPath,
    previewData,
    detailData,
    proxyData,
    warnings: info.warnings,
    findMs,
    readMs,
    renderMs,
    totalMs,
    peakRssMb: Number((peakRss / 1024 / 1024).toFixed(1)),
    cpuPercent,
    outputBytes,
    actor: payload.actor || `Ofis Ajanı (${HOSTNAME})`,
    rememberSkuMapping: !!payload.rememberSkuMapping,
  };
}

function resolveTargetDir(rawDir: string | null | undefined, fallbackDir: string): string {
  const cleaned = String(rawDir || "").trim();
  if (!cleaned) return fallbackDir;
  if (cleaned.startsWith("~/") || cleaned === "~") {
    return path.join(os.homedir(), cleaned.slice(2));
  }
  return path.resolve(cleaned);
}

function cleanFilePart(val: string | null | undefined): string {
  return String(val || "")
    .replace(/[\/\\:*?"<>|\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPrintFileName(order: any, draft: any, isSeamless: boolean): string {
  const dt = new Date(order?.date || order?.createdAt || Date.now());
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  const dateStr = `${dd}.${mm}.${yyyy}`;

  // order.customer genellikle "Bayi İsmi\nMüşteri İsmi" şeklinde iki satır olur
  const customerLines = String(order?.customer || "")
    .split(/\r?\n/)
    .map((s) => cleanFilePart(s))
    .filter(Boolean);
  const dealerName = customerLines[0] || "";
  const customerName = customerLines.slice(1).join(" ") || "";

  const item = order?.items?.[0];
  const material = cleanFilePart(item?.material || "");
  const dimStr = `${draft.width}x${draft.height}${draft.unit}`;
  const skuStr = cleanFilePart(draft.sku || item?.sku || "");
  const qtyStr = `${Number(item?.quantity || 1)} ADET`;

  const parts = [
    dateStr,
    dealerName,
    customerName,
    material,
    dimStr,
    skuStr,
    qtyStr,
    isSeamless ? "SEAMLESS" : "",
  ].filter(Boolean);

  return `${parts.join(" - ")}.tif`;
}

async function handleGeneratePrint(order: any, draft: any, settings: any, payload: any = {}) {
  const defaultOutDir = path.join(OUT_ROOT, "PRINT_READY");
  const targetDir = resolveTargetDir(payload?.targetDir || settings?.printReadyFolder, defaultOutDir);
  fs.mkdirSync(targetDir, { recursive: true });

  const isSeamless = draft.layoutMode === "seamless" && !!draft.tileConfig;
  const fileName = buildPrintFileName(order, draft, isSeamless);
  const printFile = path.join(targetDir, fileName);

  // Eğer baskı dosyası daha önce bu bilgisayarda üretildiyse ve kullanıcı farklı bir klasöre kaydetmek istiyorsa anında kopyala!
  if (!payload?.forceRegenerate && draft.printReadyPath && fs.existsSync(draft.printReadyPath)) {
    if (path.resolve(draft.printReadyPath) !== path.resolve(printFile)) {
      try {
        await fs.promises.copyFile(draft.printReadyPath, printFile);
      } catch {
        // SMB / ağ paylaşımlarında copyFile yerine güvenli akış (stream) kopyası
        await pipeline(fs.createReadStream(draft.printReadyPath), fs.createWriteStream(printFile));
      }
    }
    const stat = fs.statSync(printFile);
    return {
      draftId: draft.id,
      printReadyPath: printFile,
      printReadySha256: draft.printReadySha256 || "",
      printReadyBytes: stat.size,
    };
  }

  const engSettings: EngineSettings = {
    ...DEFAULT_ENGINE,
    minPpi: settings.minPpi || DEFAULT_ENGINE.minPpi,
    warnPpi: settings.warnPpi || DEFAULT_ENGINE.warnPpi,
    printPpiMax: settings.printPpiMax || DEFAULT_ENGINE.printPpiMax,
    maxFileBytes: Math.max(1, settings.maxFileGb || 12) * 1024 ** 3,
  };
  const info = await probeSource(draft.sourcePath, engSettings);
  const work = await ensureWorkImage(info, path.join(OUT_ROOT, "CACHE"), engSettings);
  const crop: Crop = { x: draft.cropX, y: draft.cropY, w: draft.cropW, h: draft.cropH };
  const dim = { width: draft.width, height: draft.height, unit: draft.unit };
  const tile: TileConfig | null = isSeamless ? JSON.parse(draft.tileConfig) : null;
  const ppi = isSeamless && tile ? computeTilePpi(info, dim, tile, engSettings) : computePpi(crop, dim, engSettings);

  const res =
    isSeamless && tile
      ? await renderTiledPrint(info, work, dim, tile, ppi, printFile, engSettings)
      : await renderPrint(info, work, crop, ppi, printFile, engSettings);

  return {
    draftId: draft.id,
    printReadyPath: res.path,
    printReadySha256: res.sha256,
    printReadyBytes: res.bytes,
  };
}

const LOCAL_HELPER_PORT = Number(process.env.DKM_AGENT_LOCAL_PORT || 4789);

function startLocalHelperServer() {
  const srv = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const u = new URL(req.url || "/", `http://127.0.0.1:${LOCAL_HELPER_PORT}`);
    if (u.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, hostname: HOSTNAME }));
      return;
    }

    if (u.pathname === "/download") {
      const filePath = u.searchParams.get("path") || "";
      if (!filePath || !filePath.toLowerCase().endsWith(".tif") || !fs.existsSync(filePath)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Baskı dosyası bu bilgisayarda bulunamadı." }));
        return;
      }
      const stat = fs.statSync(filePath);
      const encodedName = encodeURIComponent(path.basename(filePath));
      res.writeHead(200, {
        "Content-Type": "image/tiff",
        "Content-Length": String(stat.size),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    if (u.pathname === "/reveal") {
      const filePath = u.searchParams.get("path") || "";
      if (!filePath || !fs.existsSync(filePath)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Dosya bulunamadı." }));
        return;
      }
      if (process.platform === "darwin") {
        execFile("open", ["-R", filePath], () => {});
      } else if (process.platform === "win32") {
        execFile("explorer", [`/select,${filePath}`], () => {});
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (u.pathname === "/pick-folder") {
      if (process.platform === "darwin") {
        execFile(
          "osascript",
          ["-e", 'POSIX path of (choose folder with prompt "Baskı dosyalarının kaydedileceği klasörü seçin")'],
          (err, stdout) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            if (err || !stdout.trim()) {
              res.end(JSON.stringify({ ok: false, cancelled: true }));
            } else {
              res.end(JSON.stringify({ ok: true, folder: stdout.trim().replace(/\/$/, "") }));
            }
          },
        );
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Bu işletim sisteminde klasör seçici desteklenmiyor." }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  srv.on("error", (err: any) => {
    if (err?.code !== "EADDRINUSE") console.error("[agent] Yerel yardımcı sunucu hatası:", err?.message);
  });
  srv.listen(LOCAL_HELPER_PORT, "127.0.0.1", () => {
    console.log(`  Yerel İndirme  : http://127.0.0.1:${LOCAL_HELPER_PORT} (Finder & Direkt İndirme aktif)`);
  });
}

async function loop() {
  console.log("================================================================");
  console.log("  DKM TAKİP — OFİS WORKER AJANI BAŞLATILDI");
  console.log(`  Bulut Panel    : ${CLOUD_URL}`);
  console.log(`  Bilgisayar     : ${HOSTNAME}`);
  console.log(`  Tasarım Arşivi : ${DEFAULT_SERVER_PATH || "(Ayarlar panelinden okunur)"}`);
  console.log(`  Baskı Çıktı    : ${path.join(OUT_ROOT, "PRINT_READY")}`);
  startLocalHelperServer();
  console.log("================================================================");

  let connectedOnce = false;
  // Büyük dosya işlerken veya 2.98 TB indekslerken bile bulut panelde sürekli Çevrimiçi görünmesi için arka plan kalp atışı
  const hbTimer = setInterval(() => {
    const qs = new URLSearchParams({ hostname: HOSTNAME, serverPath: DEFAULT_SERVER_PATH, heartbeatOnly: "1" });
    fetch(`${CLOUD_URL}/api/agent/poll?${qs}`, { headers }).catch(() => {});
  }, 15_000);
  hbTimer.unref?.();

  while (true) {
    try {
      const qs = new URLSearchParams({ hostname: HOSTNAME, serverPath: DEFAULT_SERVER_PATH });
      const r = await fetch(`${CLOUD_URL}/api/agent/poll?${qs}`, { headers });
      if (!r.ok) {
        console.error(`[agent] Poll HTTP ${r.status}`);
        await new Promise((res) => setTimeout(res, 3000));
        continue;
      }
      if (!connectedOnce) {
        connectedOnce = true;
        console.log(`✅ ${CLOUD_URL} ile güvenli bağlantı kuruldu! İş bekleniyor...`);
      }
      const d = (await r.json()) as any;
      const job = d.job;
      if (!job) {
        await new Promise((res) => setTimeout(res, 350));
        continue;
      }

      console.log(`[agent] İş #${job.id} alındı: ${job.type} (orderId=${job.orderId ?? "-"})`);
      const engSettings: EngineSettings = {
        ...DEFAULT_ENGINE,
        minPpi: d.settings?.minPpi || DEFAULT_ENGINE.minPpi,
        warnPpi: d.settings?.warnPpi || DEFAULT_ENGINE.warnPpi,
        printPpiMax: d.settings?.printPpiMax || DEFAULT_ENGINE.printPpiMax,
        maxFileBytes: Math.max(1, d.settings?.maxFileGb || 12) * 1024 ** 3,
      };

      try {
        if (job.type === "test_connection") {
          const result = await handleTestConnection(job.payload?.serverPath || d.settings?.serverPath);
          await fetch(`${CLOUD_URL}/api/agent/complete`, { method: "POST", headers, body: JSON.stringify({ jobId: job.id, ok: true, result }) });
        } else if (job.type === "search_sku") {
          const result = await handleSearchSku(d.settings?.serverPath, job.payload?.sku, engSettings);
          await fetch(`${CLOUD_URL}/api/agent/complete`, { method: "POST", headers, body: JSON.stringify({ jobId: job.id, ok: true, result }) });
        } else if (job.type === "index_server") {
          const { entries, result } = await handleIndexServer(job.payload?.serverPath || d.settings?.serverPath, engSettings);
          await fetch(`${CLOUD_URL}/api/agent/complete`, {
            method: "POST",
            headers,
            body: JSON.stringify({ jobId: job.id, ok: true, result, indexEntries: entries }),
          });
        } else if (job.type === "generate_draft") {
          const draftPayload = await handleGenerateDraft(d.order, job.payload, d.settings, d.skuMappings, d.latestDraft);
          await fetch(`${CLOUD_URL}/api/agent/complete`, {
            method: "POST",
            headers,
            body: JSON.stringify({ jobId: job.id, ok: true, draftPayload }),
          });
          console.log(`[agent] ✅ Taslak #${job.orderId} gönderildi (${draftPayload.totalMs}ms, ${Math.round(draftPayload.effectivePpi)} PPI)`);
        } else if (job.type === "generate_print") {
          const printUpdate = await handleGeneratePrint(d.order, d.latestDraft, d.settings, job.payload);
          await fetch(`${CLOUD_URL}/api/agent/complete`, {
            method: "POST",
            headers,
            body: JSON.stringify({ jobId: job.id, ok: true, printUpdate }),
          });
          console.log(`[agent] ✅ Baskı TIFF kaydedildi: ${printUpdate.printReadyPath}`);
        }
      } catch (jobErr: any) {
        const err = toEngineError(jobErr);
        console.error(`[agent] ❌ İş #${job.id} hata [${err.code}]: ${err.message}`);
        await fetch(`${CLOUD_URL}/api/agent/complete`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            jobId: job.id,
            ok: false,
            error: `${err.code}: ${err.message}`,
            failedDraft: job.orderId ? { errorCode: err.code, sku: job.payload?.overrideSku || d.order?.items?.[0]?.sku || "-" } : undefined,
          }),
        });
      }
    } catch (e: any) {
      console.error("[agent] Bağlantı hatası:", e?.message || e);
      await new Promise((res) => setTimeout(res, 3000));
    }
  }
}

loop();
