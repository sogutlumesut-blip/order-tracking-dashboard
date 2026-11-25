// Demo ortamını CLI üzerinden sıfırlama (npm run demo:reset)

import { loadConfig } from "../config.ts";
import { openDb } from "../db.ts";
import { seedDemoOrders } from "../fixtures/seed-demo.ts";

async function main() {
  const cfg = loadConfig();
  const db = openDb(cfg.dbPath);
  const res = await seedDemoOrders(db, cfg.root, { reset: true });
  db.close();
  console.log(`✅ Demo ortamı sıfırlandı. Yeniden yüklenen sipariş: ${res.inserted}/${res.totalOrders}`);
}

main().catch((e) => {
  console.error("[reset] Hata:", e);
  process.exit(1);
});
