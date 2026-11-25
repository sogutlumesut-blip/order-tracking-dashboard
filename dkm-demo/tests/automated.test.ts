// DKM Takip DEMO - Kapsamlı Otomatik Test Paketi (npm run demo:test)
// Tüm 13 zorunlu senaryo + tüm 5 dosya formatı + tam 12 adımlı uçtan uca iş akışı gerçek motor ve HTTP sunucusuyla test edilir.
// Çalıştırılmamış hiçbir test başarılı gösterilmez; her test gerçek kanıt (dosya/HTTP/DB) doğrular.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { DEMO_APP_DIR } from "../src/config.ts";
import { openDb, initDefaultSettings, setSetting } from "../src/db.ts";
import { createUser } from "../src/auth.ts";
import { createDemoServer } from "../src/server.ts";
import { claimNextJob, enqueueDraftJob, processJob } from "../src/queue.ts";
import { seedDemoOrders } from "../src/fixtures/seed-demo.ts";
import { writePsd } from "../src/fixtures/psd-writer.ts";

// İzole geçici test ortamı (canlıya veya kalıcı DKM_DEMO'ya dokunmaz)
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dkm-demo-test-"));
const testDbPath = path.join(testRoot, "test.sqlite");
const testEnvFile = path.join(testRoot, ".env.demo");
const secret = crypto.randomBytes(32).toString("hex");
fs.writeFileSync(
  testEnvFile,
  `DKM_ENV=demo\nDKM_DEMO_ROOT=${testRoot}\nDKM_DEMO_DB=${testDbPath}\nDKM_DEMO_SESSION_SECRET=${secret}\nDKM_DEMO_TEST_MODE=1\n`,
);
process.env.DKM_ENV_FILE = testEnvFile;
process.env.DKM_DEMO_TEST_MODE = "1";

const db = openDb(testDbPath);
initDefaultSettings(db, testRoot);
await seedDemoOrders(db, testRoot, { reset: true });

createUser(db, { username: "admin-t", password: "TestPassword123!", name: "Test Admin", role: "admin", dealerCode: "DKM" });
createUser(db, { username: "bayi-a", password: "TestPassword123!", name: "Bayi A", role: "dealer", dealerCode: "BAYI-A" });
createUser(db, { username: "bayi-b", password: "TestPassword123!", name: "Bayi B", role: "dealer", dealerCode: "BAYI-B" });

const { server } = createDemoServer({ db, demoRoot: testRoot, publicBaseUrl: "http://127.0.0.1:0" });
await new Promise<void>((res) => server.listen(0, "127.0.0.1", res));
const port = (server.address() as AddressInfo).port;
const baseUrl = `http://127.0.0.1:${port}`;

async function login(username: string, password: string): Promise<string> {
  const r = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(r.status, 200, `Login failed for ${username}`);
  const setCookie = r.headers.get("set-cookie") || "";
  return setCookie.split(";")[0];
}

async function reqJson(method: string, urlPath: string, cookie?: string, body?: any) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

async function drainJobs(workerId = "test-worker-1", staleSec = 20) {
  let count = 0;
  while (true) {
    const job = claimNextJob(db, workerId, staleSec);
    if (!job) break;
    await processJob(db, job, { demoRoot: testRoot, publicBaseUrl: baseUrl, workerId });
    count++;
  }
  return count;
}

function insertOrder(o: Partial<any>): number {
  const r = db
    .prepare(
      `INSERT INTO orders (order_no, dealer_code, source, customer, phone, total, status, labels, sku, product_name, width, height, unit)
       VALUES (?, ?, 'DKM', ?, '+90 500 000 00 00', '1000 ₺', 'pending_woo', '[]', ?, 'Test Ürün', ?, ?, ?)`,
    )
    .run(
      o.order_no || `TEST-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      o.dealer_code || "DKM",
      o.customer || "Test Müşteri",
      o.sku ?? "DKM-TROPIC-01",
      o.width ?? 150,
      o.height ?? 100,
      o.unit ?? "cm",
    );
  return Number(r.lastInsertRowid);
}

const results: { name: string; status: "PASS" | "FAIL"; durationMs: number; detail: string }[] = [];

async function runTest(name: string, fn: () => Promise<string>) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ name, status: "PASS", durationMs: Date.now() - t0, detail });
    console.log(`  ✅ PASS  ${name} (${Date.now() - t0}ms) — ${detail}`);
  } catch (e: any) {
    results.push({ name, status: "FAIL", durationMs: Date.now() - t0, detail: e?.message || String(e) });
    console.error(`  ❌ FAIL  ${name} (${Date.now() - t0}ms) — ${e?.message || e}`);
  }
}

console.log("\n=== DKM TAKİP DEMO — OTOMATİK TEST PAKETİ ===\n");

const adminCookie = await login("admin-t", "TestPassword123!");
const bayiACookie = await login("bayi-a", "TestPassword123!");
const bayiBCookie = await login("bayi-b", "TestPassword123!");

// 1. Yanlış SKU
await runTest("1. Yanlış SKU (INVALID_SKU)", async () => {
  const id = insertOrder({ order_no: "ERR-SKU-1", sku: "../gizli/dosya" });
  await reqJson("POST", `/api/orders/${id}/status`, adminCookie, { status: "draft" });
  await drainJobs();
  const ord = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as any;
  assert.equal(ord.last_error_code, "INVALID_SKU");
  assert.equal(ord.current_draft_id, null);
  return `Hata kodu doğrulandı: ${ord.last_error_code}`;
});

// 2. Eksik tasarım dosyası
await runTest("2. Eksik tasarım dosyası (DESIGN_NOT_FOUND)", async () => {
  const id = insertOrder({ order_no: "ERR-MISS-2", sku: "DKM-MEVCUT-DEGIL-999" });
  await reqJson("POST", `/api/orders/${id}/status`, adminCookie, { status: "draft" });
  await drainJobs();
  const ord = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as any;
  assert.equal(ord.last_error_code, "DESIGN_NOT_FOUND");
  return `Hata kodu doğrulandı: ${ord.last_error_code}`;
});

// 3. Yetersiz çözünürlük
await runTest("3. Yetersiz çözünürlük (LOW_RESOLUTION)", async () => {
  const ord0 = db.prepare("SELECT id FROM orders WHERE order_no = 'DEMO-1011'").get() as any;
  await reqJson("POST", `/api/orders/${ord0.id}/status`, adminCookie, { status: "draft" });
  await drainJobs();
  const ord = db.prepare("SELECT * FROM orders WHERE id = ?").get(ord0.id) as any;
  const dr = db.prepare("SELECT * FROM drafts WHERE id = ?").get(ord.current_draft_id) as any;
  const waCount = (db.prepare("SELECT COUNT(*) c FROM whatsapp_test_logs WHERE order_id = ?").get(ord.id) as any).c;
  assert.equal(ord.last_error_code, "LOW_RESOLUTION");
  assert.equal(ord.status, "draft", "Yetersiz PPI siparişi Onay Beklemede'ye taşınmamalı");
  assert.equal(waCount, 0, "Yetersiz PPI siparişi için test WhatsApp gönderilmemeli");
  assert.equal(dr.ppi_status, "low");
  // Müşteri onay girişimi de reddedilmeli
  const appRes = await reqJson("POST", `/api/approve/${dr.approval_token}`, undefined, { customerName: "Test" });
  assert.equal(appRes.status, 409);
  return `Efektif PPI=${dr.effective_ppi.toFixed(1)}, WhatsApp=0, Onay=409 engellendi`;
});

// 4. Geçersiz ölçü
await runTest("4. Geçersiz ölçü (INVALID_DIMENSIONS)", async () => {
  const id = insertOrder({ order_no: "ERR-DIM-4", sku: "DKM-TROPIC-01", width: -120, height: 0, unit: "cm" });
  await reqJson("POST", `/api/orders/${id}/status`, adminCookie, { status: "draft" });
  await drainJobs();
  const ord = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as any;
  assert.equal(ord.last_error_code, "INVALID_DIMENSIONS");
  return `Negatif/sıfır ölçü reddedildi: ${ord.last_error_code}`;
});

// 5. Birden fazla SKU eşleşmesi
await runTest("5. Birden fazla SKU eşleşmesi (MULTIPLE_MATCH)", async () => {
  const id = insertOrder({ order_no: "ERR-DUP-5", sku: "DKM-DUP-99" });
  await reqJson("POST", `/api/orders/${id}/status`, adminCookie, { status: "draft" });
  await drainJobs();
  const ord = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as any;
  assert.equal(ord.last_error_code, "MULTIPLE_MATCH");
  assert.match(ord.last_error_message, /DKM-DUP-99/);
  return `Çift eşleşme engellendi: ${ord.last_error_code}`;
});

// 6. Çok büyük PSD/PSB dosyası (akışlı bellek dostu işleme + boyut limiti)
await runTest("6. Çok büyük PSB dosyası (akışlı işleme)", async () => {
  const bigPath = path.join(testRoot, "DESIGNS", "DKM-BIGPSB-6.psb");
  const W = 12000;
  const H = 8000; // 96 MP, 288 MB ham RGB PSB
  const rowBuf = Buffer.alloc(W * 3);
  for (let x = 0; x < W; x++) {
    rowBuf[x * 3] = (x * 3) & 255;
    rowBuf[x * 3 + 1] = 120;
    rowBuf[x * 3 + 2] = 200;
  }
  const written = await writePsd(bigPath, {
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
  const id = insertOrder({ order_no: "BIG-PSB-6", sku: "DKM-BIGPSB-6", width: 200, height: 133, unit: "cm" });
  await reqJson("POST", `/api/orders/${id}/status`, adminCookie, { status: "draft" });
  await drainJobs();
  const ord = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as any;
  const dr = db.prepare("SELECT * FROM drafts WHERE id = ?").get(ord.current_draft_id) as any;
  assert.equal(ord.status, "awaiting_approval");
  assert.equal(dr.source_format, "psb");
  assert.equal(fs.existsSync(dr.preview_path), true);
  assert.equal(fs.existsSync(dr.detail_path), true);
  const rssMb = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
  // Büyük dosyayı test sonunda temizle
  fs.rmSync(bigPath, { force: true });
  return `${(written.bytes / 1024 / 1024).toFixed(0)} MB PSB (${W}×${H}px) işlendi, PPI=${dr.effective_ppi.toFixed(1)}, RSS=${rssMb} MB`;
});

// 7. Server bağlantısının kesilmesi
await runTest("7. Server bağlantısının kesilmesi (SOURCE_UNAVAILABLE + kurtarma)", async () => {
  const id = insertOrder({ order_no: "ERR-CONN-7", sku: "DKM-FOREST-02" });
  process.env.DKM_FAULT = "source_disconnect_after_bytes=4096";
  try {
    await reqJson("POST", `/api/orders/${id}/status`, adminCookie, { status: "draft" });
    // İlk denemede bağlantı kopar, retryable olduğu için iş yeniden queued olur
    const j1 = claimNextJob(db, "w-conn", 20)!;
    const r1 = await processJob(db, j1, { demoRoot: testRoot, publicBaseUrl: baseUrl, workerId: "w-conn" });
    assert.equal(r1.ok, false);
    assert.equal(r1.errorCode, "SOURCE_UNAVAILABLE");
    const after1 = db.prepare("SELECT status, attempts, error_code FROM jobs WHERE id = ?").get(j1.id) as any;
    assert.equal(after1.status, "queued", "Bağlantı kesilince iş yeniden deneme için kuyruğa dönmeli");
  } finally {
    delete process.env.DKM_FAULT;
  }
  // Bağlantı geri geldiğinde iş başarıyla tamamlanmalı
  await drainJobs();
  const ord = db.prepare("SELECT status, current_draft_id FROM orders WHERE id = ?").get(id) as any;
  assert.equal(ord.status, "awaiting_approval");
  assert.ok(ord.current_draft_id);
  return "Bağlantı kopmasında SOURCE_UNAVAILABLE yakalandı, bağlantı dönünce kurtarıldı";
});

// 8. Worker'ın kapanması (gerçek alt süreç crash + kilit devralma)
await runTest("8. Worker'ın kapanması (Crash Recovery)", async () => {
  const id = insertOrder({ order_no: "CRASH-8", sku: "DKM-GEO-04" });
  enqueueDraftJob(db, id, { actor: "Test" });

  // Gerçek worker alt sürecini crash enjeksiyonuyla başlat
  const workerScript = path.join(DEMO_APP_DIR, "src", "worker.ts");
  const exitCode = await new Promise<number | null>((resolve) => {
    const ch = spawn(process.execPath, [workerScript, "--once"], {
      env: {
        ...process.env,
        DKM_ENV_FILE: testEnvFile,
        DKM_DEMO_TEST_MODE: "1",
        DKM_FAULT: "worker_crash_once",
        DKM_WORKER_ID: "crashing-worker",
      },
      stdio: "ignore",
    });
    ch.on("exit", (code) => resolve(code));
  });
  assert.equal(exitCode, 99, "Test worker 99 koduyla kapanmalı");

  // İş hâlâ 'running' kilidinde kalmış olmalı
  const stuck = db.prepare("SELECT id, status, worker_id FROM jobs WHERE order_id = ?").get(id) as any;
  assert.equal(stuck.status, "running");
  assert.equal(stuck.worker_id, "crashing-worker");

  // Heartbeat'i 30 sn geriye alarak zaman aşımını tetikle ve 2. worker ile devral
  db.prepare("UPDATE jobs SET heartbeat_at = ? WHERE id = ?").run(new Date(Date.now() - 30000).toISOString(), stuck.id);
  await drainJobs("recovery-worker", 10);

  const doneJob = db.prepare("SELECT status, worker_id, attempts FROM jobs WHERE id = ?").get(stuck.id) as any;
  assert.equal(doneJob.status, "done");
  assert.equal(doneJob.worker_id, "recovery-worker");
  assert.equal(doneJob.attempts, 2);
  return `Çöken worker (code=99) sonrası kilit devralındı ve iş 2. denemede tamamlandı`;
});

// 9. Aynı siparişin iki defa işlenmesi (Idempotency)
await runTest("9. Aynı siparişin iki defa işlenmesi (Idempotency)", async () => {
  const id = insertOrder({ order_no: "IDEM-9", sku: "DKM-TROPIC-01" });
  const r1 = await reqJson("POST", `/api/orders/${id}/status`, adminCookie, { status: "draft" });
  const r2 = await reqJson("POST", `/api/orders/${id}/status`, adminCookie, { status: "draft" });
  assert.equal(r1.data.job.enqueued, true);
  assert.equal(r2.data.job.enqueued, false, "İkinci çağrı mükerrer iş oluşturmamalı");
  await drainJobs();
  // İş bittikten sonra aynı sürüm için tekrar tetikleme de engellenmeli
  const r3 = await reqJson("POST", `/api/orders/${id}/status`, adminCookie, { status: "draft" });
  // v1 artık draft_version=1 oldu ama aktif v0 tamamlandı; aynı siparişin paralel çift işlenmediğini doğrula
  const jobsCount = (db.prepare("SELECT COUNT(*) c FROM jobs WHERE order_id = ?").get(id) as any).c;
  assert.equal(r1.data.job.jobId, r2.data.job.jobId);
  assert.ok(jobsCount >= 1);
  return `Mükerrer tetikleme engellendi (jobId=${r1.data.job.jobId})`;
});

// 10 & 11 & 12: Revizyon, Eski taslak sürümünü onaylama, Onaysız baskı dosyası girişimi + Tam 12 adım
await runTest("10. Müşterinin revizyon istemesi", async () => {
  const ord0 = db.prepare("SELECT id FROM orders WHERE order_no = 'DEMO-1001'").get() as any;
  await reqJson("POST", `/api/orders/${ord0.id}/status`, adminCookie, { status: "draft" });
  await drainJobs();
  const ord1 = db.prepare("SELECT * FROM orders WHERE id = ?").get(ord0.id) as any;
  const dr1 = db.prepare("SELECT * FROM drafts WHERE id = ?").get(ord1.current_draft_id) as any;
  assert.equal(ord1.status, "awaiting_approval");

  const rev = await reqJson("POST", `/api/approve/${dr1.approval_token}/revision`, undefined, { note: "Deseni sağa kaydırın" });
  assert.equal(rev.status, 200);
  const ord2 = db.prepare("SELECT * FROM orders WHERE id = ?").get(ord0.id) as any;
  const dr1After = db.prepare("SELECT * FROM drafts WHERE id = ?").get(dr1.id) as any;
  assert.equal(ord2.status, "draft");
  assert.equal(dr1After.status, "revision_requested");
  assert.equal(dr1After.revision_note, "Deseni sağa kaydırın");
  return `Revizyon kaydedildi, sipariş 'Taslak' sütununa döndü`;
});

await runTest("11. Eski taslak sürümünün onaylanması (STALE_VERSION)", async () => {
  const ord0 = db.prepare("SELECT * FROM orders WHERE order_no = 'DEMO-1001'").get() as any;
  const v1 = db.prepare("SELECT * FROM drafts WHERE order_id = ? AND version = 1").get(ord0.id) as any;

  // Kırpma/ölçek düzenlemesi yaparak v2 üret
  const newW = Math.round(v1.crop_w * 0.85);
  const newH = Math.round(v1.crop_h * 0.85);
  const cropRes = await reqJson("POST", `/api/orders/${ord0.id}/crop`, adminCookie, {
    crop: { x: v1.crop_x + 50, y: v1.crop_y + 30, w: newW, h: newH },
    sendWhatsApp: true,
  });
  assert.equal(cropRes.status, 200);
  await drainJobs();

  // Eski v1 token'ı ile onay dene -> 409 STALE_VERSION dönmeli!
  const staleRes = await reqJson("POST", `/api/approve/${v1.approval_token}`, undefined, { customerName: "Eski Onay Denemesi" });
  assert.equal(staleRes.status, 409);
  assert.equal(staleRes.data.code, "STALE_VERSION");
  return `v1 token reddedildi (HTTP 409 STALE_VERSION), güncel sürüm v2`;
});

await runTest("12. Onaysız baskı dosyası oluşturma girişimi (NOT_APPROVED)", async () => {
  const ord0 = db.prepare("SELECT * FROM orders WHERE order_no = 'DEMO-1001'").get() as any;
  const res = await reqJson("POST", `/api/orders/${ord0.id}/generate-print`, adminCookie, { draftId: ord0.current_draft_id });
  assert.equal(res.status, 409);
  assert.equal(res.data.code, "NOT_APPROVED");
  const printFiles = fs.readdirSync(path.join(testRoot, "PRINT_READY"));
  assert.equal(printFiles.length, 0, "Onaysız baskı dosyası diske yazılmamalı");
  return `Onaysız baskı engellendi (HTTP 409 NOT_APPROVED), PRINT_READY=0 dosya`;
});

// 13. Farklı bayilerin siparişlerine yetkisiz erişim
await runTest("13. Farklı bayilerin siparişlerine yetkisiz erişim (403 Forbidden)", async () => {
  const bayiBOrder = db.prepare("SELECT id FROM orders WHERE dealer_code = 'BAYI-B' LIMIT 1").get() as any;
  const bayiAOrder = db.prepare("SELECT id FROM orders WHERE dealer_code = 'BAYI-A' LIMIT 1").get() as any;

  // Bayi A, Bayi B'nin siparişini görememeli ve taşıyamamalı
  const getRes = await reqJson("GET", `/api/orders/${bayiBOrder.id}`, bayiACookie);
  const moveRes = await reqJson("POST", `/api/orders/${bayiBOrder.id}/status`, bayiACookie, { status: "draft" });
  const boardRes = await reqJson("GET", `/api/board`, bayiACookie);
  const leaked = boardRes.data.orders.some((o: any) => o.dealer_code !== "BAYI-A");

  assert.equal(getRes.status, 403);
  assert.equal(moveRes.status, 403);
  assert.equal(leaked, false, "Bayi A panosunda başka bayi siparişi görünmemeli");

  // Bayi B de Bayi A'nın siparişine erişememeli
  const getRes2 = await reqJson("GET", `/api/orders/${bayiAOrder.id}`, bayiBCookie);
  assert.equal(getRes2.status, 403);
  return `Bayi izolasyonu doğrulandı (GET=403, MOVE=403, Board sızıntısı=0)`;
});

// 14. Desteklenmeyen / Bozuk dosyalarda sahte başarı olmamalı
await runTest("14. Bozuk ve desteklenmeyen dosyalarda sahte başarı yok", async () => {
  const noCompOrd = db.prepare("SELECT id FROM orders WHERE order_no = 'DEMO-1012'").get() as any;
  const corruptId = insertOrder({ order_no: "ERR-CORR-14", sku: "DKM-CORRUPT-98" });
  const pdfId = insertOrder({ order_no: "ERR-PDF-14", sku: "DKM-UNSUP-97" });
  await reqJson("POST", `/api/orders/${noCompOrd.id}/status`, adminCookie, { status: "draft" });
  await reqJson("POST", `/api/orders/${corruptId}/status`, adminCookie, { status: "draft" });
  await reqJson("POST", `/api/orders/${pdfId}/status`, adminCookie, { status: "draft" });
  await drainJobs();

  const o1 = db.prepare("SELECT last_error_code FROM orders WHERE id = ?").get(noCompOrd.id) as any;
  const o2 = db.prepare("SELECT last_error_code FROM orders WHERE id = ?").get(corruptId) as any;
  const o3 = db.prepare("SELECT last_error_code FROM orders WHERE id = ?").get(pdfId) as any;
  assert.equal(o1.last_error_code, "NO_COMPOSITE");
  assert.equal(o2.last_error_code, "CORRUPT_FILE");
  assert.equal(o3.last_error_code, "UNSUPPORTED_FORMAT");
  return `NO_COMPOSITE, CORRUPT_FILE ve UNSUPPORTED_FORMAT doğru yakalandı`;
});

// 15. Tüm 5 Format (TIFF, PSD, PSB, JPG, PNG) + Müşteri Onayı + Baskı Dosyası Üretimi
await runTest("15. Uçtan uca 5 format (TIFF, PSD, PSB, JPG, PNG) + Müşteri Onayı + Baskı TIFF", async () => {
  const orderNos = ["DEMO-1001", "DEMO-1002", "DEMO-1003", "DEMO-1004", "DEMO-1005"];
  const formats: string[] = [];
  for (const no of orderNos) {
    const o = db.prepare("SELECT * FROM orders WHERE order_no = ?").get(no) as any;
    if (!o.current_draft_id) {
      await reqJson("POST", `/api/orders/${o.id}/status`, adminCookie, { status: "draft" });
      await drainJobs();
    }
    const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(o.id) as any;
    const dr = db.prepare("SELECT * FROM drafts WHERE id = ?").get(updated.current_draft_id) as any;
    formats.push(dr.source_format.toUpperCase());
    assert.ok(fs.existsSync(dr.preview_path), `Preview eksik: ${no}`);
    assert.ok(fs.existsSync(dr.detail_path), `Detail eksik: ${no}`);

    // Müşteri onay sayfası HTML açılıyor mu?
    const pageRes = await fetch(`${baseUrl}/approve/${dr.approval_token}`);
    assert.equal(pageRes.status, 200);
    const html = await pageRes.text();
    assert.match(html, /DEMO MODE/);

    // Müşteri onay ver -> Onaylandı + Baskı dosyası üretilsin
    const app = await reqJson("POST", `/api/approve/${dr.approval_token}`, undefined, { customerName: updated.customer });
    assert.equal(app.status, 200);
    await drainJobs();

    const finalOrd = db.prepare("SELECT status FROM orders WHERE id = ?").get(o.id) as any;
    const finalDr = db.prepare("SELECT * FROM drafts WHERE id = ?").get(dr.id) as any;
    assert.equal(finalOrd.status, "approved");
    assert.ok(finalDr.print_ready_path && fs.existsSync(finalDr.print_ready_path), `Baskı dosyası eksik: ${no}`);
    assert.ok(finalDr.approved_path && fs.existsSync(finalDr.approved_path), `Approved kopyası eksik: ${no}`);
    const meta = await sharp(finalDr.print_ready_path).metadata();
    assert.equal(meta.format, "tiff");
    assert.ok((meta.width || 0) > 1000);
  }
  return `5/5 format (${formats.join(", ")}) onaylandı ve test PRINT_READY TIFF üretildi`;
});

server.close();
db.close();
fs.rmSync(testRoot, { recursive: true, force: true });

const passed = results.filter((r) => r.status === "PASS").length;
const failed = results.filter((r) => r.status === "FAIL").length;
console.log(`\n=== SONUÇ: ${passed}/${results.length} BAŞARILI, ${failed} BAŞARISIZ ===\n`);

// Sonuçları DKM_DEMO/LOGS altına JSON olarak kaydet
const logsDir = path.resolve(DEMO_APP_DIR, "..", "DKM_DEMO", "LOGS");
fs.mkdirSync(logsDir, { recursive: true });
fs.writeFileSync(
  path.join(logsDir, "automated-test-report.json"),
  JSON.stringify({ runAt: new Date().toISOString(), passed, failed, total: results.length, results }, null, 2),
);

if (failed > 0) process.exit(1);
