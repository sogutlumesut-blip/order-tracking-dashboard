// İş kuyruğu ve taslak / baskı dosyası işleyici.
// - Aynı siparişin aynı anda iki defa işlenmesini engeller (idempotency + aktif iş kilidi).
// - Worker kapanırsa kilit zaman aşımında başka worker işi devralır.
// - Onaysız taslak için baskı dosyası üretimini reddeder.
// - Eski taslak sürümünün onaylanmasını reddeder.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Db } from "./db.ts";
import { addActivity, getAllSettings, getEngineSettingsFromDb, getPathsFromDb } from "./db.ts";
import { appendLog, ensureDemoFolders, validateOutputPath } from "./paths.ts";
import { findDesignBySku } from "./engine/sku-finder.ts";
import {
  computePpi,
  defaultCrop,
  ensureProxy,
  ensureWorkImage,
  probeSource,
  renderDetail,
  renderPreview,
  renderPrint,
  validateCrop,
} from "./engine/index.ts";
import type { Crop } from "./engine/index.ts";
import { toInches, validateDim, formatDim } from "./engine/units.ts";
import { EngineError, toEngineError } from "./engine/errors.ts";
import { ioStats } from "./engine/source-file.ts";

export interface JobRow {
  id: number;
  order_id: number;
  type: "generate_draft" | "rerender_draft" | "generate_print";
  status: "queued" | "running" | "done" | "failed";
  idempotency_key: string | null;
  payload: string;
  attempts: number;
  max_attempts: number;
  worker_id: string | null;
}

export interface ProcessContext {
  demoRoot: string;
  publicBaseUrl: string;
  workerId: string;
}

export function enqueueDraftJob(
  db: Db,
  orderId: number,
  opts: { actor?: string; autoSendWhatsApp?: boolean; forceNew?: boolean } = {},
): { enqueued: boolean; jobId: number; reason?: string } {
  const tx = db.transaction(() => {
    const order = db.prepare("SELECT id, order_no, draft_version, status FROM orders WHERE id = ?").get(orderId) as any;
    if (!order) throw new Error(`Sipariş bulunamadı: ${orderId}`);

    // Aktif (queued/running) bir taslak işi zaten varsa mükerrer iş oluşturma
    const active = db
      .prepare("SELECT id FROM jobs WHERE order_id = ? AND type IN ('generate_draft', 'rerender_draft') AND status IN ('queued', 'running') LIMIT 1")
      .get(orderId) as { id: number } | undefined;
    if (active) {
      return { enqueued: false, jobId: active.id, reason: "Bu sipariş için zaten aktif bir taslak işi var" };
    }

    // Aynı sürüm için idempotency anahtarı (çift tetiklemeyi önler)
    const idemKey = opts.forceNew ? null : `draft:order:${orderId}:v${order.draft_version}`;
    if (idemKey) {
      const prev = db.prepare("SELECT id, status FROM jobs WHERE idempotency_key = ?").get(idemKey) as { id: number; status: string } | undefined;
      if (prev && prev.status !== "failed") {
        return { enqueued: false, jobId: prev.id, reason: "Bu sipariş sürümü zaten işlendi (idempotent)" };
      }
      if (prev && prev.status === "failed") {
        // Başarısız olmuş iş yeniden denenebilir; eski anahtarı temizle
        db.prepare("UPDATE jobs SET idempotency_key = NULL WHERE id = ?").run(prev.id);
      }
    }

    const payload = JSON.stringify({
      actor: opts.actor || "Sistem",
      autoSendWhatsApp: opts.autoSendWhatsApp ?? true,
    });
    const res = db
      .prepare("INSERT INTO jobs (order_id, type, status, idempotency_key, payload) VALUES (?, 'generate_draft', 'queued', ?, ?)")
      .run(orderId, idemKey, payload);
    addActivity(db, orderId, opts.actor || "Sistem", "Taslak Kuyruğa Alındı", `İş #${res.lastInsertRowid} sıraya eklendi.`);
    return { enqueued: true, jobId: Number(res.lastInsertRowid) };
  });
  return tx();
}

export function enqueueRerenderJob(
  db: Db,
  orderId: number,
  opts: { crop: Crop; detailCenter?: { cx: number; cy: number }; actor: string; sendWhatsApp?: boolean },
): { enqueued: boolean; jobId: number } {
  const tx = db.transaction(() => {
    const active = db
      .prepare("SELECT id FROM jobs WHERE order_id = ? AND type IN ('generate_draft', 'rerender_draft') AND status IN ('queued', 'running') LIMIT 1")
      .get(orderId) as { id: number } | undefined;
    if (active) return { enqueued: false, jobId: active.id };

    const payload = JSON.stringify({
      crop: opts.crop,
      detailCenter: opts.detailCenter || null,
      actor: opts.actor,
      autoSendWhatsApp: opts.sendWhatsApp ?? false,
    });
    const res = db
      .prepare("INSERT INTO jobs (order_id, type, status, payload) VALUES (?, 'rerender_draft', 'queued', ?)")
      .run(orderId, payload);
    addActivity(db, orderId, opts.actor, "Kırpma/Ölçek Düzenlendi", `Yeni taslak sürümü için iş #${res.lastInsertRowid} kuyruğa alındı.`);
    return { enqueued: true, jobId: Number(res.lastInsertRowid) };
  });
  return tx();
}

export function enqueuePrintJob(db: Db, orderId: number, draftId: number, actor: string): { enqueued: boolean; jobId: number } {
  const order = db.prepare("SELECT id, status, current_draft_id FROM orders WHERE id = ?").get(orderId) as any;
  if (!order) throw new EngineError("INTERNAL", "Sipariş bulunamadı");
  const draft = db.prepare("SELECT id, status, version FROM drafts WHERE id = ? AND order_id = ?").get(draftId, orderId) as any;
  if (!draft) throw new EngineError("NOT_APPROVED", "Taslak kaydı bulunamadı");
  if (draft.status !== "approved") {
    throw new EngineError("NOT_APPROVED", `Taslak v${draft.version} onaylı değil (mevcut durum: ${draft.status}). Onaysız baskı dosyası üretilemez.`);
  }
  if (order.current_draft_id !== draft.id) {
    throw new EngineError("STALE_VERSION", `Taslak v${draft.version} güncel sürüm değil; eski sürüm için baskı dosyası üretilemez.`);
  }

  const idemKey = `print:order:${orderId}:draft:${draftId}`;
  const existing = db.prepare("SELECT id, status FROM jobs WHERE idempotency_key = ?").get(idemKey) as { id: number; status: string } | undefined;
  if (existing && existing.status !== "failed") {
    return { enqueued: false, jobId: existing.id };
  }
  if (existing && existing.status === "failed") {
    db.prepare("UPDATE jobs SET idempotency_key = NULL WHERE id = ?").run(existing.id);
  }

  const res = db
    .prepare("INSERT INTO jobs (order_id, type, status, idempotency_key, payload) VALUES (?, 'generate_print', 'queued', ?, ?)")
    .run(orderId, idemKey, JSON.stringify({ draftId, actor }));
  addActivity(db, orderId, actor, "Baskı Dosyası Kuyruğa Alındı", `Onaylı v${draft.version} için yüksek çözünürlüklü baskı dosyası iş #${res.lastInsertRowid} ile üretiliyor.`);
  return { enqueued: true, jobId: Number(res.lastInsertRowid) };
}

export function reclaimStaleJobs(db: Db, staleSeconds = 20): number {
  const cutoff = new Date(Date.now() - staleSeconds * 1000).toISOString();
  const stale = db
    .prepare("SELECT id, order_id, attempts, max_attempts, worker_id FROM jobs WHERE status = 'running' AND heartbeat_at < ?")
    .all(cutoff) as any[];
  let count = 0;
  for (const j of stale) {
    if (j.attempts < j.max_attempts) {
      db.prepare("UPDATE jobs SET status = 'queued', worker_id = NULL, locked_at = NULL, heartbeat_at = NULL WHERE id = ? AND status = 'running'").run(j.id);
      addActivity(db, j.order_id, "Sistem", "Worker Kurtarma", `Yanıt vermeyen worker (${j.worker_id}) sonrası iş #${j.id} yeniden kuyruğa alındı.`);
    } else {
      db.prepare(
        "UPDATE jobs SET status = 'failed', finished_at = datetime('now'), error_code = 'WORKER_CRASH', error_message = 'Worker yanıt vermeyi kesti ve deneme hakkı doldu' WHERE id = ?",
      ).run(j.id);
      db.prepare("UPDATE orders SET last_error_code = 'WORKER_CRASH', last_error_message = 'Worker kapandı', updated_at = datetime('now') WHERE id = ?").run(j.order_id);
    }
    count++;
  }
  return count;
}

export function claimNextJob(db: Db, workerId: string, staleSeconds = 20): JobRow | null {
  reclaimStaleJobs(db, staleSeconds);
  const claim = db.transaction(() => {
    const row = db.prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY id ASC LIMIT 1").get() as JobRow | undefined;
    if (!row) return null;
    const now = new Date().toISOString();
    const upd = db
      .prepare(
        `UPDATE jobs SET status = 'running', worker_id = ?, attempts = attempts + 1,
         locked_at = ?, heartbeat_at = ?, started_at = COALESCE(started_at, ?)
         WHERE id = ? AND status = 'queued'`,
      )
      .run(workerId, now, now, now, row.id);
    if (upd.changes !== 1) return null;
    return db.prepare("SELECT * FROM jobs WHERE id = ?").get(row.id) as JobRow;
  });
  return claim.immediate();
}

export function heartbeatJob(db: Db, jobId: number) {
  db.prepare("UPDATE jobs SET heartbeat_at = ? WHERE id = ? AND status = 'running'").run(new Date().toISOString(), jobId);
}

export function createTestWhatsAppRecord(
  db: Db,
  order: any,
  draft: { id: number; version: number; effective_ppi: number; preview_path: string; approval_token: string },
  publicBaseUrl: string,
  actor = "Otomasyon (DEMO)",
) {
  const approvalUrl = `${publicBaseUrl}/approve/${draft.approval_token}`;
  const previewUrl = `${publicBaseUrl}/api/files/preview/${draft.id}`;
  const dimTxt = formatDim({ width: order.width, height: order.height, unit: order.unit });
  const message =
    `[DEMO TEST - GERÇEK MÜŞTERİYE GÖNDERİLMEDİ]\n` +
    `Merhaba ${order.customer},\n` +
    `#${order.order_no} numaralı (${order.sku} • ${dimTxt}) siparişinizin v${draft.version} taslağı hazırlandı (${Math.round(draft.effective_ppi)} PPI).\n` +
    `Önizleme ve onay bağlantısı: ${approvalUrl}`;

  const res = db
    .prepare(
      `INSERT INTO whatsapp_test_logs (order_id, draft_id, phone, customer, message, preview_url, approval_url, mode, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'DEMO_SIMULATED', 'simulated_sent')`,
    )
    .run(order.id, draft.id, order.phone || "+90 500 000 00 00 (TEST)", order.customer, message, previewUrl, approvalUrl);

  db.prepare("UPDATE drafts SET status = 'sent' WHERE id = ?").run(draft.id);
  db.prepare("UPDATE orders SET status = 'awaiting_approval', updated_at = datetime('now') WHERE id = ?").run(order.id);
  addActivity(
    db,
    order.id,
    actor,
    "Test WhatsApp Gönderildi (DEMO)",
    `Gerçek mesaj gönderilmedi; test kaydı #${res.lastInsertRowid} oluşturuldu. Sipariş "Onay Beklemede" durumuna taşındı. Onay bağlantısı: ${approvalUrl}`,
  );
  return { logId: Number(res.lastInsertRowid), approvalUrl, previewUrl, message };
}

export async function processJob(db: Db, job: JobRow, ctx: ProcessContext): Promise<{ ok: boolean; errorCode?: string }> {
  const t0 = Date.now();
  const bytesBefore = ioStats.sourceBytesRead;
  let peakRss = process.memoryUsage().rss;
  const trackMem = () => {
    const r = process.memoryUsage().rss;
    if (r > peakRss) peakRss = r;
  };
  const hb = setInterval(() => {
    trackMem();
    try {
      heartbeatJob(db, job.id);
    } catch {}
  }, 3000);

  const paths = getPathsFromDb(db, ctx.demoRoot);
  ensureDemoFolders(paths);
  const engineSettings = getEngineSettingsFromDb(db);
  const settings = getAllSettings(db);
  const payload = JSON.parse(job.payload || "{}");

  try {
    // Test modu: worker ani kapanma senaryosu
    if (process.env.DKM_DEMO_TEST_MODE === "1" && (process.env.DKM_FAULT || "").includes("worker_crash_once") && job.attempts === 1) {
      appendLog(paths.logs, "worker.jsonl", { level: "warn", workerId: ctx.workerId, jobId: job.id, event: "simulated_worker_crash" });
      clearInterval(hb);
      process.exit(99);
    }

    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(job.order_id) as any;
    if (!order) throw new EngineError("INTERNAL", `Sipariş bulunamadı: ${job.order_id}`);

    if (job.type === "generate_draft" || job.type === "rerender_draft") {
      // 1. Ölçü doğrula
      const dim = validateDim({ width: order.width, height: order.height, unit: order.unit });
      const inch = toInches(dim);
      const targetAspect = inch.w / inch.h;

      // 2. SKU ile gerçek tasarım dosyasını bul (salt okunur)
      const sourcePath = await findDesignBySku(paths.designs, order.sku);

      // 3. Dosyayı incele (format, boyut, bozuk/desteklenmeyen kontrolü)
      const info = await probeSource(sourcePath, engineSettings);
      trackMem();

      // 4. PSD/PSB ise satır satır ara TIFF oluştur (CACHE), diğerlerinde doğrudan kullan
      const work = await ensureWorkImage(info, paths.cache, engineSettings);
      trackMem();

      // 5. Proxy oluştur (tarayıcı kırpma editörü ve hızlı önizleme için)
      const proxy = await ensureProxy(info, work, paths.cache, engineSettings);
      trackMem();

      // 6. Kırpma alanı ve efektif PPI hesapla
      const crop: Crop = payload.crop
        ? validateCrop(payload.crop, info.width, info.height, targetAspect)
        : defaultCrop(info.width, info.height, targetAspect);
      const ppi = computePpi(crop, dim, engineSettings);

      // 7. Çıktı yollarını doğrula (canlı baskı klasörüne yazma koruması)
      validateOutputPath(paths.previews, paths.designs, ctx.demoRoot);
      validateOutputPath(paths.details, paths.designs, ctx.demoRoot);

      const nextVersion = Number(order.draft_version || 0) + 1;
      const safeOrderNo = String(order.order_no).replace(/[^A-Za-z0-9_-]/g, "_");
      const previewPath = path.join(paths.previews, `${safeOrderNo}_v${nextVersion}_preview.jpg`);
      const detailPath = path.join(paths.details, `${safeOrderNo}_v${nextVersion}_detail100.jpg`);

      // 8. JPG taslak önizlemesi ve %100 yakın detay görseli üret
      await renderPreview(info, work, proxy, crop, ppi, { orderNo: order.order_no, sku: order.sku, version: nextVersion, dim }, previewPath, engineSettings);
      await renderDetail(info, work, crop, ppi, detailPath, engineSettings, payload.detailCenter || undefined);
      trackMem();

      const approvalToken = crypto.randomBytes(20).toString("hex");
      const durationMs = Date.now() - t0;
      const warnings = [...info.warnings];
      if (ppi.status === "warn") warnings.push(`Efektif çözünürlük önerilenin altında (${ppi.effectivePpi.toFixed(1)} PPI < ${engineSettings.warnPpi} PPI)`);
      if (ppi.status === "low") warnings.push(`YETERSİZ ÇÖZÜNÜRLÜK: ${ppi.effectivePpi.toFixed(1)} PPI (asgari ${engineSettings.minPpi} PPI)`);

      const saveTx = db.transaction(() => {
        // Eski taslak sürümlerini geçersiz kıl (superseded)
        db.prepare("UPDATE drafts SET status = 'superseded' WHERE order_id = ? AND status IN ('ready', 'sent', 'revision_requested')").run(order.id);

        const ins = db
          .prepare(
            `INSERT INTO drafts (
              order_id, version, sku, source_path, source_format, source_width, source_height, source_space, source_bytes,
              crop_x, crop_y, crop_w, crop_h, effective_ppi, out_ppi, ppi_status, out_width, out_height,
              proxy_path, preview_path, detail_path, status, approval_token, processing_ms, warnings
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            order.id,
            nextVersion,
            order.sku,
            sourcePath,
            info.format,
            info.width,
            info.height,
            info.space,
            info.sizeBytes,
            crop.x,
            crop.y,
            crop.w,
            crop.h,
            ppi.effectivePpi,
            ppi.outPpi,
            ppi.status,
            ppi.outW,
            ppi.outH,
            proxy.proxyPath,
            previewPath,
            detailPath,
            ppi.status === "low" ? "failed" : "ready",
            approvalToken,
            durationMs,
            JSON.stringify(warnings),
          );
        const draftId = Number(ins.lastInsertRowid);

        if (ppi.status === "low") {
          db.prepare(
            `UPDATE orders SET current_draft_id = ?, draft_version = ?, last_error_code = 'LOW_RESOLUTION',
             last_error_message = ?, updated_at = datetime('now') WHERE id = ?`,
          ).run(
            draftId,
            nextVersion,
            `Yetersiz çözünürlük: ${ppi.effectivePpi.toFixed(1)} PPI (asgari ${engineSettings.minPpi} PPI). Taslak otomatik gönderilmedi.`,
            order.id,
          );
          addActivity(
            db,
            order.id,
            payload.actor || "Otomasyon",
            "Yetersiz Çözünürlük Uyarısı",
            `Taslak v${nextVersion} üretildi ancak efektif PPI (${ppi.effectivePpi.toFixed(1)}) asgari sınırın (${engineSettings.minPpi} PPI) altında. Onay gönderimi durduruldu.`,
          );
          return { draftId, lowPpi: true };
        }

        db.prepare(
          `UPDATE orders SET current_draft_id = ?, draft_version = ?, last_error_code = NULL,
           last_error_message = NULL, updated_at = datetime('now') WHERE id = ?`,
        ).run(draftId, nextVersion, order.id);

        addActivity(
          db,
          order.id,
          payload.actor || "Otomasyon",
          `Taslak v${nextVersion} Oluşturuldu`,
          `Format: ${info.format.toUpperCase()} (${info.width}×${info.height}px, ${info.space}), Efektif PPI: ${ppi.effectivePpi.toFixed(1)}, Süre: ${durationMs}ms.`,
        );

        const shouldSendWa = payload.autoSendWhatsApp !== false && settings.auto_send_whatsapp_test !== "0";
        if (shouldSendWa) {
          createTestWhatsAppRecord(
            db,
            order,
            { id: draftId, version: nextVersion, effective_ppi: ppi.effectivePpi, preview_path: previewPath, approval_token: approvalToken },
            ctx.publicBaseUrl,
            payload.actor || "Otomasyon (DEMO)",
          );
        }
        return { draftId, lowPpi: false };
      });

      const res = saveTx();
      const bytesRead = Math.max(0, ioStats.sourceBytesRead - bytesBefore) + (info.format === "psd" || info.format === "psb" ? 0 : info.sizeBytes);
      db.prepare(
        `UPDATE jobs SET status = 'done', finished_at = datetime('now'), duration_ms = ?, peak_rss_bytes = ?, bytes_read = ?,
         error_code = ?, error_message = ? WHERE id = ?`,
      ).run(
        Date.now() - t0,
        peakRss,
        bytesRead,
        res.lowPpi ? "LOW_RESOLUTION" : null,
        res.lowPpi ? `Yetersiz çözünürlük (${ppi.effectivePpi.toFixed(1)} PPI)` : null,
        job.id,
      );
      appendLog(paths.logs, "worker.jsonl", {
        level: res.lowPpi ? "warn" : "info",
        workerId: ctx.workerId,
        jobId: job.id,
        orderNo: order.order_no,
        type: job.type,
        version: nextVersion,
        format: info.format,
        effectivePpi: Number(ppi.effectivePpi.toFixed(1)),
        durationMs: Date.now() - t0,
        peakRssMb: Number((peakRss / 1024 / 1024).toFixed(1)),
      });
      return { ok: !res.lowPpi, errorCode: res.lowPpi ? "LOW_RESOLUTION" : undefined };
    }

    if (job.type === "generate_print") {
      const draftId = Number(payload.draftId);
      const draft = db.prepare("SELECT * FROM drafts WHERE id = ? AND order_id = ?").get(draftId, order.id) as any;
      if (!draft || draft.status !== "approved" || order.current_draft_id !== draft.id) {
        throw new EngineError("NOT_APPROVED", "Onaylı ve güncel olmayan taslak için baskı dosyası üretilemez");
      }

      validateOutputPath(paths.approved, paths.designs, ctx.demoRoot);
      validateOutputPath(paths.printReady, paths.designs, ctx.demoRoot);

      const dim = validateDim({ width: order.width, height: order.height, unit: order.unit });
      const info = await probeSource(draft.source_path, engineSettings);
      const work = await ensureWorkImage(info, paths.cache, engineSettings);
      const crop: Crop = { x: draft.crop_x, y: draft.crop_y, w: draft.crop_w, h: draft.crop_h };
      const ppi = computePpi(crop, dim, engineSettings);

      const safeOrderNo = String(order.order_no).replace(/[^A-Za-z0-9_-]/g, "_");
      const safeSku = String(order.sku).replace(/[^A-Za-z0-9_-]/g, "_");
      const approvedFile = path.join(paths.approved, `${safeOrderNo}_v${draft.version}_approved.jpg`);
      const approvedMeta = path.join(paths.approved, `${safeOrderNo}_v${draft.version}_approval.json`);
      const printFile = path.join(paths.printReady, `${safeOrderNo}_${safeSku}_${order.width}x${order.height}${order.unit}_v${draft.version}_PRINT.tif`);

      if (draft.preview_path && fs.existsSync(draft.preview_path)) {
        await fs.promises.copyFile(draft.preview_path, approvedFile);
      }
      const printRes = await renderPrint(info, work, crop, ppi, printFile, engineSettings);
      trackMem();

      await fs.promises.writeFile(
        approvedMeta,
        JSON.stringify(
          {
            mode: "DEMO_TEST_ONLY",
            orderNo: order.order_no,
            sku: order.sku,
            version: draft.version,
            approvedAt: draft.approved_at,
            approvedBy: draft.approved_by_name,
            dimensions: formatDim(dim),
            crop,
            effectivePpi: ppi.effectivePpi,
            printFile: path.basename(printRes.path),
            printWidthPx: printRes.width,
            printHeightPx: printRes.height,
            printPpi: printRes.ppi,
            colorSpace: printRes.colorSpace,
            sha256: printRes.sha256,
            bytes: printRes.bytes,
          },
          null,
          2,
        ),
      );

      db.prepare(
        `UPDATE drafts SET approved_path = ?, print_ready_path = ?, print_ready_sha256 = ?, print_ready_bytes = ? WHERE id = ?`,
      ).run(approvedFile, printRes.path, printRes.sha256, printRes.bytes, draft.id);
      addActivity(
        db,
        order.id,
        payload.actor || "Otomasyon",
        "Test Baskı Dosyası Kaydedildi",
        `Yüksek çözünürlüklü baskı dosyası TEST klasörüne yazıldı: ${path.basename(printRes.path)} (${printRes.width}×${printRes.height}px, ${printRes.ppi.toFixed(1)} PPI, ${(printRes.bytes / 1024 / 1024).toFixed(2)} MB, SHA-256: ${printRes.sha256.slice(0, 12)}...).`,
      );
      db.prepare(
        `UPDATE jobs SET status = 'done', finished_at = datetime('now'), duration_ms = ?, peak_rss_bytes = ?, bytes_read = ? WHERE id = ?`,
      ).run(Date.now() - t0, peakRss, info.sizeBytes, job.id);
      appendLog(paths.logs, "worker.jsonl", {
        level: "info",
        workerId: ctx.workerId,
        jobId: job.id,
        orderNo: order.order_no,
        type: "generate_print",
        printBytes: printRes.bytes,
        durationMs: Date.now() - t0,
      });
      return { ok: true };
    }

    throw new EngineError("INTERNAL", `Bilinmeyen iş tipi: ${job.type}`);
  } catch (e: any) {
    const err = toEngineError(e);
    const durationMs = Date.now() - t0;
    const canRetry = err.retryable && job.attempts < job.max_attempts;
    if (canRetry) {
      db.prepare(
        "UPDATE jobs SET status = 'queued', worker_id = NULL, locked_at = NULL, heartbeat_at = NULL, error_code = ?, error_message = ? WHERE id = ?",
      ).run(err.code, err.message, job.id);
    } else {
      db.prepare(
        `UPDATE jobs SET status = 'failed', finished_at = datetime('now'), duration_ms = ?, peak_rss_bytes = ?,
         error_code = ?, error_message = ? WHERE id = ?`,
      ).run(durationMs, peakRss, err.code, err.message, job.id);
      db.prepare("UPDATE orders SET last_error_code = ?, last_error_message = ?, updated_at = datetime('now') WHERE id = ?").run(
        err.code,
        err.message,
        job.order_id,
      );
      addActivity(db, job.order_id, "Otomasyon Hata", `Hata: ${err.code}`, err.message);
    }
    appendLog(paths.logs, "worker.jsonl", {
      level: "error",
      workerId: ctx.workerId,
      jobId: job.id,
      orderId: job.order_id,
      code: err.code,
      message: err.message,
      retrying: canRetry,
      durationMs,
    });
    return { ok: false, errorCode: err.code };
  } finally {
    clearInterval(hb);
  }
}
