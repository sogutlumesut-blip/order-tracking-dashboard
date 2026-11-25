// DKM Takip DEMO veritabanı (yerel SQLite - better-sqlite3).
// Canlı PostgreSQL veritabanına asla bağlanmaz.

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { defaultPaths, FOLDER_KEYS } from "./paths.ts";
import type { DemoPaths } from "./paths.ts";
import { DEFAULT_ENGINE } from "./engine/index.ts";
import type { EngineSettings } from "./engine/index.ts";

export type Db = Database.Database;

export const DEFAULT_COLUMNS = [
  { id: "pending_woo", title: "Bekliyor (DKM)", color: "#64748b", sort_order: 0 },
  { id: "pending_pm", title: "Bekliyor (PrintMarkt)", color: "#475569", sort_order: 1 },
  { id: "draft", title: "Taslak", color: "#f59e0b", sort_order: 2 },
  { id: "awaiting_approval", title: "Onay Beklemede", color: "#8b5cf6", sort_order: 3 },
  { id: "approved", title: "Onaylandı", color: "#10b981", sort_order: 4 },
  { id: "processing", title: "Hazırlanıyor", color: "#3b82f6", sort_order: 5 },
  { id: "shipped", title: "Kargolandı", color: "#f97316", sort_order: 6 },
  { id: "completed", title: "Tamamlandı", color: "#22c55e", sort_order: 7 },
  { id: "cancelled", title: "İptal Edildi", color: "#ef4444", sort_order: 8 },
];

export function openDb(dbPath: string): Db {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 10000");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  migrate(db);
  return db;
}

export function migrate(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'operator',
      dealer_code TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS status_columns (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      color TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT NOT NULL UNIQUE,
      dealer_code TEXT NOT NULL DEFAULT 'DKM',
      source TEXT NOT NULL DEFAULT 'DKM',
      customer TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      city TEXT,
      total TEXT NOT NULL DEFAULT '0 ₺',
      status TEXT NOT NULL DEFAULT 'pending_woo',
      labels TEXT NOT NULL DEFAULT '[]',
      assigned_to TEXT,
      barcode TEXT,
      sku TEXT NOT NULL,
      product_name TEXT NOT NULL,
      material TEXT,
      width REAL NOT NULL,
      height REAL NOT NULL,
      unit TEXT NOT NULL,
      dimensions_raw TEXT,
      note TEXT,
      current_draft_id INTEGER,
      draft_version INTEGER NOT NULL DEFAULT 0,
      last_error_code TEXT,
      last_error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_dealer ON orders(dealer_code);

    CREATE TABLE IF NOT EXISTS drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      sku TEXT NOT NULL,
      source_path TEXT,
      source_format TEXT,
      source_width INTEGER,
      source_height INTEGER,
      source_space TEXT,
      source_bytes INTEGER,
      crop_x INTEGER,
      crop_y INTEGER,
      crop_w INTEGER,
      crop_h INTEGER,
      effective_ppi REAL,
      out_ppi REAL,
      ppi_status TEXT,
      out_width INTEGER,
      out_height INTEGER,
      proxy_path TEXT,
      preview_path TEXT,
      detail_path TEXT,
      approved_path TEXT,
      print_ready_path TEXT,
      print_ready_sha256 TEXT,
      print_ready_bytes INTEGER,
      status TEXT NOT NULL DEFAULT 'generating',
      approval_token TEXT UNIQUE,
      approved_at TEXT,
      approved_by_name TEXT,
      revision_note TEXT,
      processing_ms INTEGER,
      warnings TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_drafts_order ON drafts(order_id);
    CREATE INDEX IF NOT EXISTS idx_drafts_token ON drafts(approval_token);

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      idempotency_key TEXT UNIQUE,
      payload TEXT NOT NULL DEFAULT '{}',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      worker_id TEXT,
      locked_at TEXT,
      heartbeat_at TEXT,
      started_at TEXT,
      finished_at TEXT,
      duration_ms INTEGER,
      peak_rss_bytes INTEGER,
      bytes_read INTEGER,
      error_code TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, id);
    CREATE INDEX IF NOT EXISTS idx_jobs_order ON jobs(order_id);

    CREATE TABLE IF NOT EXISTS whatsapp_test_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      draft_id INTEGER REFERENCES drafts(id) ON DELETE SET NULL,
      phone TEXT NOT NULL,
      customer TEXT NOT NULL,
      message TEXT NOT NULL,
      preview_url TEXT,
      approval_url TEXT,
      mode TEXT NOT NULL DEFAULT 'DEMO_SIMULATED',
      status TEXT NOT NULL DEFAULT 'simulated_sent',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_wa_order ON whatsapp_test_logs(order_id);

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_act_order ON activities(order_id);
  `);
}

export function initDefaultSettings(db: Db, demoRoot: string) {
  const p = defaultPaths(demoRoot);
  const defaults: Record<string, string> = {
    path_designs: p.designs,
    path_previews: p.previews,
    path_details: p.details,
    path_approved: p.approved,
    path_print_ready: p.printReady,
    path_cache: p.cache,
    path_logs: p.logs,
    designs_mode: "local_readonly",
    min_ppi: String(DEFAULT_ENGINE.minPpi),
    warn_ppi: String(DEFAULT_ENGINE.warnPpi),
    print_ppi_max: String(DEFAULT_ENGINE.printPpiMax),
    max_file_gb: String(Math.round(DEFAULT_ENGINE.maxFileBytes / 1024 ** 3)),
    auto_send_whatsapp_test: "1",
    live_promotion_status: "locked",
    live_promotion_note: "Canlı sisteme geçiş yönetici onayı olmadan kilitlidir.",
  };
  const ins = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(defaults)) ins.run(k, v);
    const colIns = db.prepare("INSERT OR IGNORE INTO status_columns (id, title, color, sort_order) VALUES (?, ?, ?, ?)");
    for (const c of DEFAULT_COLUMNS) colIns.run(c.id, c.title, c.color, c.sort_order);
  });
  tx();
}

export function getAllSettings(db: Db): Record<string, string> {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export function setSetting(db: Db, key: string, value: string) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function getPathsFromDb(db: Db, demoRoot: string): DemoPaths {
  const s = getAllSettings(db);
  const def = defaultPaths(demoRoot);
  const out = { ...def };
  for (const fk of FOLDER_KEYS) {
    if (s[fk.settingKey]) out[fk.key] = path.resolve(s[fk.settingKey]);
  }
  return out;
}

export function getEngineSettingsFromDb(db: Db): EngineSettings {
  const s = getAllSettings(db);
  return {
    ...DEFAULT_ENGINE,
    minPpi: Number(s.min_ppi || DEFAULT_ENGINE.minPpi),
    warnPpi: Number(s.warn_ppi || DEFAULT_ENGINE.warnPpi),
    printPpiMax: Number(s.print_ppi_max || DEFAULT_ENGINE.printPpiMax),
    maxFileBytes: Math.max(1, Number(s.max_file_gb || 12)) * 1024 ** 3,
  };
}

export function addActivity(db: Db, orderId: number, author: string, action: string, details: string) {
  db.prepare("INSERT INTO activities (order_id, author, action, details) VALUES (?, ?, ?, ?)").run(orderId, author, action, details);
}
