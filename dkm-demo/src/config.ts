// DKM Takip DEMO - ortam yapılandırması
// Bu modül YALNIZCA .env.demo dosyasını okur. Canlı sistemin .env dosyası asla yüklenmez.
// Canlı sisteme ait tüm ortam değişkenleri süreç başlarken bellekten silinir.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEMO_APP_DIR = path.resolve(__dirname, "..");
export const REPO_ROOT = path.resolve(DEMO_APP_DIR, "..");

// Canlı ortama ait olabilecek değişken adları (demo süreçlerinde silinir)
const LIVE_ENV_PATTERNS = [
  /^DATABASE_URL$/i,
  /^DIRECT_URL$/i,
  /^POSTGRES/i,
  /^PG(HOST|USER|PASSWORD|DATABASE|PORT)$/i,
  /WOO/i,
  /SHOPIFY/i,
  /ETSY/i,
  /PRINTMARKT/i,
  /KARGO/i,
  /DHL/i,
  /FATURA/i,
  /FAIRE/i,
  /WAYFAIR/i,
  /OZON/i,
  /WHATSAPP/i,
  /TWILIO/i,
  /NEXT_SERVER_ACTIONS/i,
];

export interface DemoConfig {
  env: "demo";
  envFile: string;
  host: string;
  port: number;
  root: string; // DKM_DEMO kök klasörü
  dbPath: string;
  sessionSecret: string;
  publicBaseUrl: string;
  workers: number;
  testMode: boolean; // otomatik testler için hata enjeksiyonu izni
}

function parseEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  const text = fs.readFileSync(file, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

export function scrubLiveEnv(): string[] {
  const removed: string[] = [];
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("DKM_")) continue;
    if (LIVE_ENV_PATTERNS.some((re) => re.test(k))) {
      delete process.env[k];
      removed.push(k);
    }
  }
  return removed;
}

let cached: DemoConfig | null = null;

export function defaultEnvFile(): string {
  return process.env.DKM_ENV_FILE ? path.resolve(process.env.DKM_ENV_FILE) : path.join(REPO_ROOT, ".env.demo");
}

export function loadConfig(opts: { allowMissingSecret?: boolean } = {}): DemoConfig {
  if (cached) return cached;
  scrubLiveEnv();
  const envFile = defaultEnvFile();
  if (path.basename(envFile) === ".env") {
    throw new Error("GÜVENLİK: Demo ortamı canlı .env dosyasını kullanamaz. .env.demo kullanın.");
  }
  const fileVals = parseEnvFile(envFile);
  const get = (k: string, d?: string) => (process.env[k] ?? fileVals[k] ?? d) as string | undefined;

  const env = get("DKM_ENV");
  if (env !== "demo") {
    throw new Error(
      `GÜVENLİK: DKM_ENV=demo olmalı (bulunan: ${env ?? "yok"}). Ortam dosyası: ${envFile}. ` +
        `Kurulum için: npm run demo:setup`,
    );
  }
  const root = path.resolve(REPO_ROOT, get("DKM_DEMO_ROOT", "./DKM_DEMO")!);
  const dbPath = path.resolve(REPO_ROOT, get("DKM_DEMO_DB", path.join(root, "demo.sqlite"))!);
  if (/^(postgres|postgresql|mysql):/i.test(dbPath) || /^(postgres|postgresql):/i.test(get("DKM_DEMO_DB", "") || "")) {
    throw new Error("GÜVENLİK: Demo veritabanı yerel SQLite dosyası olmalıdır.");
  }
  const secret = get("DKM_DEMO_SESSION_SECRET", "") || "";
  if (!opts.allowMissingSecret && secret.length < 32) {
    throw new Error("DKM_DEMO_SESSION_SECRET eksik veya kısa. `npm run demo:setup` çalıştırın.");
  }
  const port = Number(get("DKM_DEMO_PORT", "4100"));
  const host = get("DKM_DEMO_HOST", "127.0.0.1")!;
  cached = {
    env: "demo",
    envFile,
    host,
    port,
    root,
    dbPath,
    sessionSecret: secret,
    publicBaseUrl: (get("DKM_DEMO_PUBLIC_BASE_URL", `http://localhost:${port}`) || "").replace(/\/$/, ""),
    workers: Math.max(1, Number(get("DKM_DEMO_WORKERS", "1"))),
    testMode: get("DKM_DEMO_TEST_MODE", "0") === "1",
  };
  return cached;
}

export function resetConfigCache() {
  cached = null;
}
