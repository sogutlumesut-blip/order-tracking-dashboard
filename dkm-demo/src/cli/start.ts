// DKM Takip DEMO Başlatıcı (npm run demo:start)
// Web arayüzünü + yapılandırılan sayıda gerçek görsel işleme worker sürecini başlatır.

import { fork } from "node:child_process";
import path from "node:path";
import { DEMO_APP_DIR, loadConfig } from "../config.ts";
import { createDemoServer } from "../server.ts";

const cfg = loadConfig();
const argWorkers = process.argv.find((a) => a.startsWith("--workers="));
const workerCount = argWorkers ? Math.max(1, Number(argWorkers.split("=")[1])) : cfg.workers;

const { server, db } = createDemoServer();
const workerScript = path.join(DEMO_APP_DIR, "src", "worker.ts");
const children: ReturnType<typeof fork>[] = [];

function spawnWorker(idx: number) {
  const child = fork(workerScript, [], {
    env: {
      ...process.env,
      DKM_ENV: "demo",
      DKM_WORKER_ID: `demo-worker-${idx}`,
    },
    stdio: "inherit",
  });
  child.on("exit", (code, sig) => {
    if (!shuttingDown) {
      console.warn(`[demo] demo-worker-${idx} kapandı (code=${code}, sig=${sig}), 1sn sonra yeniden başlatılıyor...`);
      setTimeout(() => spawnWorker(idx), 1000);
    }
  });
  children.push(child);
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\n[demo] Kapatılıyor...");
  for (const c of children) c.kill("SIGTERM");
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(cfg.port, cfg.host, () => {
  console.log("========================================================");
  console.log("  DKM TAKİP — DEMO MODE ÇALIŞIYOR");
  console.log(`  Adres          : http://${cfg.host}:${cfg.port}`);
  console.log(`  Veritabanı     : ${cfg.dbPath}`);
  console.log(`  Test Klasörleri: ${cfg.root}`);
  console.log(`  Worker Sayısı  : ${workerCount}`);
  console.log("  Canlı Sistem   : İZOLE (bağlantı yok)");
  console.log("========================================================");
  for (let i = 1; i <= workerCount; i++) spawnWorker(i);
});
