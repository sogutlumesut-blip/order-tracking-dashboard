// DKM Takip DEMO Kurulum Aracı (npm run demo:setup)
// - .env.demo dosyasını güvenli rastgele anahtarla oluşturur (canlı .env'e dokunmaz).
// - DKM_DEMO/ altındaki 7 test klasörünü oluşturur.
// - Ayrı SQLite demo veritabanını başlatır.
// - Demo yönetici hesabını güvenli parola ile oluşturur (kodda sabit parola yoktur).
// - Gerçek TIFF, PSD, PSB, JPG, PNG test tasarımlarını ve 12 test siparişini yükler.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { REPO_ROOT, defaultEnvFile, loadConfig, resetConfigCache } from "../config.ts";
import { openDb, initDefaultSettings } from "../db.ts";
import { createUser } from "../auth.ts";
import { seedDemoOrders } from "../fixtures/seed-demo.ts";

function genPassword(len = 16): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

async function main() {
  const envFile = defaultEnvFile();
  if (!fs.existsSync(envFile)) {
    const secret = crypto.randomBytes(32).toString("hex");
    const content = [
      "# DKM Takip DEMO/TEST Ortam Ayarlari (Canli .env dosyasindan tamamen bagimsizdir)",
      "DKM_ENV=demo",
      "DKM_DEMO_HOST=127.0.0.1",
      "DKM_DEMO_PORT=4100",
      "DKM_DEMO_ROOT=./DKM_DEMO",
      "DKM_DEMO_DB=./DKM_DEMO/demo.sqlite",
      "DKM_DEMO_PUBLIC_BASE_URL=http://localhost:4100",
      "DKM_DEMO_WORKERS=1",
      `DKM_DEMO_SESSION_SECRET=${secret}`,
      "",
    ].join("\n");
    fs.writeFileSync(envFile, content, { mode: 0o600 });
    console.log(`[setup] Oluşturuldu: ${path.relative(REPO_ROOT, envFile)} (izin: 600)`);
  } else {
    console.log(`[setup] Mevcut ortam dosyası kullanılıyor: ${path.relative(REPO_ROOT, envFile)}`);
  }

  resetConfigCache();
  const cfg = loadConfig();
  const db = openDb(cfg.dbPath);
  initDefaultSettings(db, cfg.root);

  // Yönetici hesabı kontrol / oluşturma
  const adminUser = process.env.DKM_ADMIN_USER || "demo-admin";
  const existingAdmin = db.prepare("SELECT id FROM users WHERE username = ?").get(adminUser);
  let printedAdminPass: string | null = null;
  if (!existingAdmin || process.env.DKM_ADMIN_PASSWORD) {
    const pass = process.env.DKM_ADMIN_PASSWORD || genPassword(16);
    createUser(db, { username: adminUser, password: pass, name: "Demo Yönetici", role: "admin", dealerCode: "DKM" });
    if (!process.env.DKM_ADMIN_PASSWORD) printedAdminPass = pass;
  }

  // Test bayileri (yetkisiz erişim testi için)
  const bayiAPass = process.env.DKM_BAYI_A_PASSWORD || genPassword(14);
  const bayiBPass = process.env.DKM_BAYI_B_PASSWORD || genPassword(14);
  if (!db.prepare("SELECT id FROM users WHERE username = 'bayi-a'").get()) {
    createUser(db, { username: "bayi-a", password: bayiAPass, name: "Anadolu Dekor (Bayi A)", role: "dealer", dealerCode: "BAYI-A" });
  }
  if (!db.prepare("SELECT id FROM users WHERE username = 'bayi-b'").get()) {
    createUser(db, { username: "bayi-b", password: bayiBPass, name: "Marmara Duvar (Bayi B)", role: "dealer", dealerCode: "BAYI-B" });
  }

  console.log("[setup] Gerçek tasarım dosyaları (TIFF, PSD, PSB, JPG, PNG) ve 12 test siparişi hazırlanıyor...");
  const seeded = await seedDemoOrders(db, cfg.root, { reset: false });
  db.close();

  console.log(`[setup] Tamamlandı! Oluşturulan tasarım dosyası: ${seeded.createdFiles.length}, Eklenen sipariş: ${seeded.inserted}/${seeded.totalOrders}`);
  console.log(`[setup] Demo kökü: ${cfg.root}`);
  console.log(`[setup] Demo veritabanı: ${cfg.dbPath}`);
  if (printedAdminPass) {
    console.log("\n========================================================");
    console.log("  DEMO YÖNETİCİ HESABI (TEK SEFERLİK GÖSTERİM)");
    console.log(`  Kullanıcı Adı : ${adminUser}`);
    console.log(`  Parola        : ${printedAdminPass}`);
    console.log("  Parolayı sıfırlamak için: npm run demo:create-admin");
    console.log("========================================================\n");
  } else {
    console.log(`[setup] Yönetici hesabı hazır: ${adminUser} (parola değiştirmek için: npm run demo:create-admin)`);
  }
}

main().catch((e) => {
  console.error("[setup] Hata:", e);
  process.exit(1);
});
