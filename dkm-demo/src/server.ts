// DKM Takip DEMO HTTP Sunucusu ve API
// Yalnızca yerel demo veritabanı ve test klasörleriyle çalışır.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import { loadConfig, DEMO_APP_DIR } from "./config.ts";
import {
  openDb,
  initDefaultSettings,
  getAllSettings,
  setSetting,
  getPathsFromDb,
  addActivity,
} from "./db.ts";
import type { Db } from "./db.ts";
import {
  authenticate,
  canAccessOrder,
  createSession,
  deleteSession,
  getUserBySession,
  SESSION_COOKIE,
} from "./auth.ts";
import type { DemoUser } from "./auth.ts";
import {
  createTestWhatsAppRecord,
  enqueueDraftJob,
  enqueuePrintJob,
  enqueueRerenderJob,
} from "./queue.ts";
import { ensureDemoFolders, FOLDER_KEYS, validateOutputPath } from "./paths.ts";
import { seedDemoOrders } from "./fixtures/seed-demo.ts";
import { EngineError } from "./engine/errors.ts";
import { renderApprovalPage } from "./views/approval-page.ts";

function parseCookies(req: http.IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  const hdr = req.headers.cookie;
  if (!hdr) return out;
  for (const part of hdr.split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const c of req) {
    total += c.length;
    if (total > 2 * 1024 * 1024) throw new Error("İstek gövdesi çok büyük");
    chunks.push(Buffer.from(c));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function sendJson(res: http.ServerResponse, status: number, data: any, extraHeaders: Record<string, string> = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-DKM-Mode": "DEMO",
    ...extraHeaders,
  });
  res.end(body);
}

function sendHtml(res: http.ServerResponse, status: number, html: string) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-DKM-Mode": "DEMO",
  });
  res.end(html);
}

function sendFile(res: http.ServerResponse, filePath: string, contentType: string, downloadName?: string) {
  if (!filePath || !fs.existsSync(filePath)) {
    sendJson(res, 404, { error: "Dosya bulunamadı" });
    return;
  }
  const st = fs.statSync(filePath);
  const headers: Record<string, string | number> = {
    "Content-Type": contentType,
    "Content-Length": st.size,
    "Cache-Control": "no-store",
    "X-DKM-Mode": "DEMO",
  };
  if (downloadName) headers["Content-Disposition"] = `attachment; filename="${downloadName}"`;
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
}

export function createDemoServer(opts: { db?: Db; demoRoot?: string; publicBaseUrl?: string } = {}) {
  const cfg = loadConfig();
  const db = opts.db || openDb(cfg.dbPath);
  const demoRoot = opts.demoRoot || cfg.root;
  const publicBaseUrl = opts.publicBaseUrl || cfg.publicBaseUrl;
  initDefaultSettings(db, demoRoot);
  ensureDemoFolders(getPathsFromDb(db, demoRoot));

  const uiHtmlPath = path.join(DEMO_APP_DIR, "public", "index.html");

  const getUser = (req: http.IncomingMessage): DemoUser | null => {
    const cookies = parseCookies(req);
    return getUserBySession(db, cookies[SESSION_COOKIE]);
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const p = url.pathname;
      const method = req.method || "GET";

      // Health check
      if (method === "GET" && p === "/api/health") {
        const queued = (db.prepare("SELECT COUNT(*) c FROM jobs WHERE status = 'queued'").get() as any).c;
        const running = (db.prepare("SELECT COUNT(*) c FROM jobs WHERE status = 'running'").get() as any).c;
        return sendJson(res, 200, { ok: true, mode: "DEMO", queued, running, dbPath: cfg.dbPath });
      }

      // Auth endpoints
      if (method === "POST" && p === "/api/auth/login") {
        const body = await readJson(req);
        const user = authenticate(db, String(body.username || ""), String(body.password || ""));
        if (!user) return sendJson(res, 401, { error: "Geçersiz kullanıcı adı veya parola" });
        const token = createSession(db, user.id);
        return sendJson(
          res,
          200,
          { user },
          {
            "Set-Cookie": `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`,
          },
        );
      }

      if (method === "POST" && p === "/api/auth/logout") {
        const cookies = parseCookies(req);
        deleteSession(db, cookies[SESSION_COOKIE]);
        return sendJson(res, 200, { ok: true }, { "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0` });
      }

      if (method === "GET" && p === "/api/auth/me") {
        const user = getUser(req);
        if (!user) return sendJson(res, 401, { error: "Oturum açılmadı" });
        return sendJson(res, 200, { user, mode: "DEMO" });
      }

      // Public Customer Approval Page: GET /approve/:token
      const approvePageMatch = p.match(/^\/approve\/([a-f0-9]{16,80})$/);
      if (method === "GET" && approvePageMatch) {
        const token = approvePageMatch[1];
        const draft = db.prepare("SELECT * FROM drafts WHERE approval_token = ?").get(token) as any;
        if (!draft) return sendHtml(res, 404, "<h1>Onay bağlantısı bulunamadı</h1>");
        const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(draft.order_id) as any;
        const isCurrent = order && order.current_draft_id === draft.id;
        return sendHtml(res, 200, renderApprovalPage({ order, draft, isCurrent, token }));
      }

      // Public Customer Approve API: POST /api/approve/:token
      const approveApiMatch = p.match(/^\/api\/approve\/([a-f0-9]{16,80})$/);
      if (method === "POST" && approveApiMatch) {
        const token = approveApiMatch[1];
        const body = await readJson(req);
        const customerName = String(body.customerName || "").trim();
        const draft = db.prepare("SELECT * FROM drafts WHERE approval_token = ?").get(token) as any;
        if (!draft) return sendJson(res, 404, { error: "Geçersiz onay bağlantısı", code: "NOT_FOUND" });
        const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(draft.order_id) as any;
        if (!order) return sendJson(res, 404, { error: "Sipariş bulunamadı" });

        // Eski taslak sürümünün onaylanmasını reddet!
        if (order.current_draft_id !== draft.id || draft.status === "superseded") {
          return sendJson(res, 409, {
            code: "STALE_VERSION",
            error: `Taslak v${draft.version} artık güncel değil (güncel sürüm: v${order.draft_version}). Lütfen en son gönderilen onay bağlantısını kullanın.`,
          });
        }
        if (draft.status === "approved") {
          return sendJson(res, 200, { ok: true, alreadyApproved: true, orderStatus: order.status, draftVersion: draft.version });
        }
        if (draft.status === "failed" || draft.ppi_status === "low") {
          return sendJson(res, 409, { code: "LOW_RESOLUTION", error: "Yetersiz çözünürlüklü taslak onaylanamaz." });
        }

        const approver = customerName || order.customer;
        db.transaction(() => {
          db.prepare("UPDATE drafts SET status = 'approved', approved_at = datetime('now'), approved_by_name = ? WHERE id = ?").run(
            approver,
            draft.id,
          );
          db.prepare("UPDATE orders SET status = 'approved', updated_at = datetime('now') WHERE id = ?").run(order.id);
          addActivity(
            db,
            order.id,
            `Müşteri (${approver})`,
            "Müşteri Taslağı Onayladı",
            `Taslak v${draft.version} müşteri tarafından onaylandı. Sipariş "Onaylandı" durumuna taşındı.`,
          );
        })();

        // Onay sonrası yüksek çözünürlüklü baskı dosyasını test klasörüne kaydetmek için işi kuyruğa al
        const printJob = enqueuePrintJob(db, order.id, draft.id, `Müşteri Onayı (${approver})`);
        return sendJson(res, 200, {
          ok: true,
          orderStatus: "approved",
          draftVersion: draft.version,
          printJobId: printJob.jobId,
        });
      }

      // Public Customer Revision Request API: POST /api/approve/:token/revision
      const revApiMatch = p.match(/^\/api\/approve\/([a-f0-9]{16,80})\/revision$/);
      if (method === "POST" && revApiMatch) {
        const token = revApiMatch[1];
        const body = await readJson(req);
        const note = String(body.note || "").trim();
        if (!note) return sendJson(res, 400, { error: "Lütfen revizyon açıklamasını yazın." });

        const draft = db.prepare("SELECT * FROM drafts WHERE approval_token = ?").get(token) as any;
        if (!draft) return sendJson(res, 404, { error: "Geçersiz onay bağlantısı" });
        const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(draft.order_id) as any;
        if (order.current_draft_id !== draft.id || draft.status === "superseded") {
          return sendJson(res, 409, {
            code: "STALE_VERSION",
            error: `Taslak v${draft.version} artık güncel değil.`,
          });
        }
        if (draft.status === "approved") {
          return sendJson(res, 409, { error: "Onaylanmış taslak için revizyon istenemez." });
        }

        db.transaction(() => {
          db.prepare("UPDATE drafts SET status = 'revision_requested', revision_note = ? WHERE id = ?").run(note, draft.id);
          db.prepare("UPDATE orders SET status = 'draft', updated_at = datetime('now') WHERE id = ?").run(order.id);
          addActivity(
            db,
            order.id,
            `Müşteri (${order.customer})`,
            "Revizyon İstendi",
            `Taslak v${draft.version} için revizyon talebi: "${note}". Sipariş "Taslak" sütununa geri alındı.`,
          );
        })();
        return sendJson(res, 200, { ok: true, orderStatus: "draft", revisionNote: note });
      }

      // File serving: /api/files/(preview|detail|proxy|print)/:draftId (token veya oturum ile)
      const fileMatch = p.match(/^\/api\/files\/(preview|detail|proxy|print)\/(\d+)$/);
      if (method === "GET" && fileMatch) {
        const kind = fileMatch[1];
        const draftId = Number(fileMatch[2]);
        const token = url.searchParams.get("token");
        const draft = db.prepare("SELECT * FROM drafts WHERE id = ?").get(draftId) as any;
        if (!draft) return sendJson(res, 404, { error: "Taslak bulunamadı" });
        const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(draft.order_id) as any;

        const tokenValid = !!token && token === draft.approval_token && (kind === "preview" || kind === "detail");
        if (!tokenValid) {
          const user = getUser(req);
          if (!user) return sendJson(res, 401, { error: "Yetkisiz erişim" });
          if (!canAccessOrder(user, order)) return sendJson(res, 403, { error: "Bu bayinin sipariş dosyalarına erişim yetkiniz yok" });
        }

        if (kind === "preview") return sendFile(res, draft.preview_path, "image/jpeg");
        if (kind === "detail") return sendFile(res, draft.detail_path, "image/jpeg");
        if (kind === "proxy") return sendFile(res, draft.proxy_path, "image/jpeg");
        if (kind === "print") {
          if (draft.status !== "approved" || !draft.print_ready_path) {
            return sendJson(res, 409, { error: "Onaylı baskı dosyası bulunamadı" });
          }
          return sendFile(res, draft.print_ready_path, "image/tiff", path.basename(draft.print_ready_path));
        }
      }

      // UI ana sayfası (login ekranı + kanban arayüzü istemci tarafında tek sayfada)
      if (method === "GET" && (p === "/" || p === "/login" || p === "/admin")) {
        const html = fs.readFileSync(uiHtmlPath, "utf8");
        return sendHtml(res, 200, html);
      }

      // --- Aşağıdaki tüm /api/* uçları oturum gerektirir ---
      const user = getUser(req);
      if (!user) return sendJson(res, 401, { error: "Oturum gerekli" });

      // GET /api/board
      if (method === "GET" && p === "/api/board") {
        const columns = db.prepare("SELECT * FROM status_columns ORDER BY sort_order ASC").all();
        const allOrders = db.prepare("SELECT * FROM orders ORDER BY id ASC").all() as any[];
        const orders = allOrders.filter((o) => canAccessOrder(user, o));

        const draftStmt = db.prepare("SELECT * FROM drafts WHERE id = ?");
        const activeJobStmt = db.prepare("SELECT id, type, status, worker_id, error_code, error_message FROM jobs WHERE order_id = ? ORDER BY id DESC LIMIT 1");
        const waCountStmt = db.prepare("SELECT COUNT(*) c FROM whatsapp_test_logs WHERE order_id = ?");

        const enriched = orders.map((o) => ({
          ...o,
          labels: JSON.parse(o.labels || "[]"),
          currentDraft: o.current_draft_id ? draftStmt.get(o.current_draft_id) : null,
          lastJob: activeJobStmt.get(o.id) || null,
          whatsappCount: (waCountStmt.get(o.id) as any).c,
        }));

        const queueStats = {
          queued: (db.prepare("SELECT COUNT(*) c FROM jobs WHERE status = 'queued'").get() as any).c,
          running: (db.prepare("SELECT COUNT(*) c FROM jobs WHERE status = 'running'").get() as any).c,
          done: (db.prepare("SELECT COUNT(*) c FROM jobs WHERE status = 'done'").get() as any).c,
          failed: (db.prepare("SELECT COUNT(*) c FROM jobs WHERE status = 'failed'").get() as any).c,
        };
        const settings = getAllSettings(db);
        return sendJson(res, 200, {
          mode: "DEMO",
          user,
          columns,
          orders: enriched,
          queueStats,
          livePromotionStatus: settings.live_promotion_status || "locked",
        });
      }

      // GET /api/orders/:id
      const orderMatch = p.match(/^\/api\/orders\/(\d+)$/);
      if (method === "GET" && orderMatch) {
        const id = Number(orderMatch[1]);
        const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as any;
        if (!order) return sendJson(res, 404, { error: "Sipariş bulunamadı" });
        if (!canAccessOrder(user, order)) {
          return sendJson(res, 403, { error: "Yetkisiz erişim: Bu sipariş farklı bir bayiye aittir." });
        }
        const drafts = db.prepare("SELECT * FROM drafts WHERE order_id = ? ORDER BY version DESC").all(id);
        const activities = db.prepare("SELECT * FROM activities WHERE order_id = ? ORDER BY id DESC LIMIT 50").all(id);
        const jobs = db.prepare("SELECT * FROM jobs WHERE order_id = ? ORDER BY id DESC LIMIT 20").all(id);
        const whatsappLogs = db.prepare("SELECT * FROM whatsapp_test_logs WHERE order_id = ? ORDER BY id DESC LIMIT 20").all(id);
        return sendJson(res, 200, {
          order: { ...order, labels: JSON.parse(order.labels || "[]") },
          drafts,
          activities,
          jobs,
          whatsappLogs,
          publicBaseUrl,
        });
      }

      // POST /api/orders/:id/status — Sütun değiştirme (Taslak sütununa taşındığında otomasyonu tetikler!)
      const statusMatch = p.match(/^\/api\/orders\/(\d+)\/status$/);
      if (method === "POST" && statusMatch) {
        const id = Number(statusMatch[1]);
        const body = await readJson(req);
        const targetStatus = String(body.status || "");
        const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as any;
        if (!order) return sendJson(res, 404, { error: "Sipariş bulunamadı" });
        if (!canAccessOrder(user, order)) {
          return sendJson(res, 403, { error: "Yetkisiz erişim: Farklı bayinin siparişini taşıyamazsınız." });
        }
        const col = db.prepare("SELECT * FROM status_columns WHERE id = ?").get(targetStatus) as any;
        if (!col) return sendJson(res, 400, { error: `Geçersiz durum sütunu: ${targetStatus}` });

        db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(targetStatus, id);
        addActivity(db, id, user.name, "Durum Değiştirildi", `${order.status} → ${col.title}`);

        let jobResult: any = null;
        if (targetStatus === "draft") {
          jobResult = enqueueDraftJob(db, id, {
            actor: user.name,
            autoSendWhatsApp: body.autoSendWhatsApp ?? true,
            forceNew: !!body.forceNew,
          });
        }
        return sendJson(res, 200, { ok: true, status: targetStatus, job: jobResult });
      }

      // POST /api/orders/:id/crop — Tarayıcı kırpma & ölçek düzenleme
      const cropMatch = p.match(/^\/api\/orders\/(\d+)\/crop$/);
      if (method === "POST" && cropMatch) {
        const id = Number(cropMatch[1]);
        const body = await readJson(req);
        const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as any;
        if (!order) return sendJson(res, 404, { error: "Sipariş bulunamadı" });
        if (!canAccessOrder(user, order)) return sendJson(res, 403, { error: "Yetkisiz erişim" });
        if (!body.crop) return sendJson(res, 400, { error: "Kırpma koordinatları eksik" });

        const job = enqueueRerenderJob(db, id, {
          crop: body.crop,
          detailCenter: body.detailCenter,
          actor: user.name,
          sendWhatsApp: !!body.sendWhatsApp,
        });
        return sendJson(res, 200, { ok: true, job });
      }

      // POST /api/orders/:id/send-whatsapp — Test WhatsApp kaydı oluştur + Onay Beklemede'ye taşı
      const waMatch = p.match(/^\/api\/orders\/(\d+)\/send-whatsapp$/);
      if (method === "POST" && waMatch) {
        const id = Number(waMatch[1]);
        const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as any;
        if (!order) return sendJson(res, 404, { error: "Sipariş bulunamadı" });
        if (!canAccessOrder(user, order)) return sendJson(res, 403, { error: "Yetkisiz erişim" });
        const draft = order.current_draft_id
          ? (db.prepare("SELECT * FROM drafts WHERE id = ?").get(order.current_draft_id) as any)
          : null;
        if (!draft) return sendJson(res, 400, { error: "Önce taslak oluşturulmalıdır" });
        if (draft.ppi_status === "low" || draft.status === "failed") {
          return sendJson(res, 409, { error: "Yetersiz çözünürlüklü veya hatalı taslak müşteriye gönderilemez" });
        }
        const rec = createTestWhatsAppRecord(db, order, draft, publicBaseUrl, user.name);
        return sendJson(res, 200, { ok: true, ...rec });
      }

      // POST /api/orders/:id/generate-print — Onaysız baskı dosyası üretimini engeller!
      const printMatch = p.match(/^\/api\/orders\/(\d+)\/generate-print$/);
      if (method === "POST" && printMatch) {
        const id = Number(printMatch[1]);
        const body = await readJson(req);
        const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as any;
        if (!order) return sendJson(res, 404, { error: "Sipariş bulunamadı" });
        if (!canAccessOrder(user, order)) return sendJson(res, 403, { error: "Yetkisiz erişim" });
        const draftId = Number(body.draftId || order.current_draft_id);
        if (!draftId) return sendJson(res, 409, { code: "NOT_APPROVED", error: "Onaylanmış bir taslak yok." });
        try {
          const job = enqueuePrintJob(db, id, draftId, user.name);
          return sendJson(res, 200, { ok: true, job });
        } catch (e: any) {
          if (e instanceof EngineError) return sendJson(res, 409, { code: e.code, error: e.message });
          throw e;
        }
      }

      // GET /api/whatsapp-logs
      if (method === "GET" && p === "/api/whatsapp-logs") {
        const rows = db
          .prepare(
            `SELECT w.*, o.order_no, o.dealer_code, o.sku FROM whatsapp_test_logs w
             JOIN orders o ON o.id = w.order_id ORDER BY w.id DESC LIMIT 100`,
          )
          .all() as any[];
        return sendJson(res, 200, { logs: rows.filter((r) => canAccessOrder(user, r)) });
      }

      // --- Yönetici (Admin) Uçları ---
      if (p.startsWith("/api/admin/")) {
        if (user.role !== "admin") return sendJson(res, 403, { error: "Bu işlem yalnızca yönetici (admin) yetkisi gerektirir." });

        if (method === "GET" && p === "/api/admin/settings") {
          const settings = getAllSettings(db);
          const paths = getPathsFromDb(db, demoRoot);
          const folderStatus = FOLDER_KEYS.map((fk) => ({
            ...fk,
            path: paths[fk.key],
            exists: fs.existsSync(paths[fk.key]),
          }));
          return sendJson(res, 200, { settings, folderStatus, demoRoot, dbPath: cfg.dbPath });
        }

        if (method === "POST" && p === "/api/admin/settings") {
          const body = await readJson(req);
          const curPaths = getPathsFromDb(db, demoRoot);
          const nextDesigns = body.path_designs ? path.resolve(String(body.path_designs)) : curPaths.designs;

          // Çıktı klasörlerinin canlı sisteme yazmasını engelle
          for (const fk of FOLDER_KEYS) {
            if (!fk.readOnly && body[fk.settingKey]) {
              const validated = validateOutputPath(String(body[fk.settingKey]), nextDesigns, demoRoot);
              setSetting(db, fk.settingKey, validated);
            }
          }
          if (body.path_designs) setSetting(db, "path_designs", nextDesigns);
          for (const k of ["designs_mode", "min_ppi", "warn_ppi", "print_ppi_max", "max_file_gb", "auto_send_whatsapp_test"]) {
            if (body[k] !== undefined) setSetting(db, k, String(body[k]));
          }
          ensureDemoFolders(getPathsFromDb(db, demoRoot));
          return sendJson(res, 200, { ok: true, settings: getAllSettings(db) });
        }

        if (method === "POST" && p === "/api/admin/reset") {
          const r = await seedDemoOrders(db, demoRoot, { reset: true });
          return sendJson(res, 200, { ok: true, message: "Demo ortamı sıfırlandı ve test siparişleri yeniden yüklendi.", ...r });
        }

        if (method === "POST" && p === "/api/admin/live-promotion") {
          const body = await readJson(req);
          const action = String(body.action || "");
          if (action === "approve") {
            const note = String(body.note || "").trim();
            if (!note) return sendJson(res, 400, { error: "Yönetici onay notu zorunludur." });
            setSetting(db, "live_promotion_status", "approved_for_merge");
            setSetting(db, "live_promotion_approved_by", user.username);
            setSetting(db, "live_promotion_approved_at", new Date().toISOString());
            setSetting(db, "live_promotion_note", note);
            return sendJson(res, 200, {
              ok: true,
              status: "approved_for_merge",
              message: "Yönetici onayı kaydedildi. Not: Demo sunucusu canlı sisteme otomatik geçiş yapmaz; main branch merge işlemi kontrollü olarak yapılmalıdır.",
            });
          } else {
            setSetting(db, "live_promotion_status", "locked");
            setSetting(db, "live_promotion_note", "Canlı geçiş yeniden kilitlendi.");
            return sendJson(res, 200, { ok: true, status: "locked" });
          }
        }
      }

      sendJson(res, 404, { error: "Bulunamadı" });
    } catch (e: any) {
      if (e instanceof EngineError) {
        return sendJson(res, 400, { code: e.code, error: e.message });
      }
      console.error("[server error]", e);
      sendJson(res, 500, { error: e?.message || "Sunucu hatası" });
    }
  });

  return { server, db };
}
