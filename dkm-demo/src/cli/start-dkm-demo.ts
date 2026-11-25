// Gerçek DKM Takip Next.js arayüzünü izole DEMO MODE'da http://127.0.0.1:4100 adresinde başlatır.
// - Canlı DATABASE_URL ortam değişkenini alt süreçten siler (canlı DB'ye bağlanamaz).
// - Yalnızca yerel DKM_DEMO/dkm-takip-demo.sqlite veritabanını kullanır.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../config.ts";

const demoRoot = path.join(REPO_ROOT, "DKM_DEMO");
const demoDbPath = path.join(demoRoot, "dkm-takip-demo.sqlite");

if (!fs.existsSync(demoDbPath)) {
  console.error("[demo:start] Demo veritabanı bulunamadı:", demoDbPath);
  console.error("Önce çalıştırın: npm run demo:import-orders");
  process.exit(1);
}

const env: Record<string, string | undefined> = { ...process.env };
// Canlı PostgreSQL ve canlı entegrasyon değişkenlerini bellekten temizle
for (const k of Object.keys(env)) {
  if (/^(DATABASE_URL|DIRECT_URL|POSTGRES|PG)/i.test(k)) {
    delete env[k];
  }
}
env.DKM_DEMO_MODE = "1";
env.NEXT_PUBLIC_DKM_DEMO_MODE = "1";
env.DEMO_DATABASE_URL = `file:${demoDbPath}`;
env.MAINTENANCE_MODE = "false";

const port = process.env.DKM_DEMO_PORT || "4100";
const host = process.env.DKM_DEMO_HOST || "127.0.0.1";

console.log("================================================================");
console.log("  DKM TAKİP — BİREBİR DEMO PANELİ BAŞLATILIYOR");
console.log(`  Adres          : http://${host}:${port}`);
console.log(`  Veritabanı     : ${demoDbPath} (İZOLE SQLite)`);
console.log("  Canlı DB / WA  : TAMAMEN İZOLE (bağlantı kapalı)");
console.log("================================================================");

const nextBin = path.join(REPO_ROOT, "node_modules", ".bin", "next");
const child = spawn(nextBin, ["dev", "-H", host, "-p", port], {
  cwd: REPO_ROOT,
  env,
  stdio: "inherit",
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("exit", (code) => process.exit(code ?? 0));
