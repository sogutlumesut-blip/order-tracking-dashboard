// Bağımsız DEMO Worker süreci.
// Tek veya birden fazla worker olarak çalıştırılabilir.
// Kuyruktaki işleri alır, görsel işleme motorunu çalıştırır.

import { loadConfig } from "./config.ts";
import { openDb, initDefaultSettings } from "./db.ts";
import { claimNextJob, processJob } from "./queue.ts";

export async function runWorkerLoop(opts: {
  workerId?: string;
  pollMs?: number;
  staleSeconds?: number;
  exitWhenIdle?: boolean;
  maxJobs?: number;
} = {}) {
  const cfg = loadConfig();
  const db = openDb(cfg.dbPath);
  initDefaultSettings(db, cfg.root);
  const workerId = opts.workerId || `worker-${process.pid}`;
  const pollMs = opts.pollMs ?? 300;
  const staleSeconds = opts.staleSeconds ?? 20;
  let running = true;
  let processed = 0;

  const stop = () => {
    running = false;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (running) {
    const job = claimNextJob(db, workerId, staleSeconds);
    if (!job) {
      if (opts.exitWhenIdle) break;
      await new Promise((r) => setTimeout(r, pollMs));
      continue;
    }
    await processJob(db, job, {
      demoRoot: cfg.root,
      publicBaseUrl: cfg.publicBaseUrl,
      workerId,
    });
    processed++;
    if (opts.maxJobs && processed >= opts.maxJobs) break;
  }

  db.close();
  return processed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const idx = process.env.DKM_WORKER_ID || `worker-${process.pid}`;
  const exitWhenIdle = process.argv.includes("--once");
  const staleSec = Number(process.env.DKM_STALE_SECONDS || "20");
  runWorkerLoop({ workerId: idx, exitWhenIdle, staleSeconds: staleSec }).catch((e) => {
    console.error("[worker] hata:", e);
    process.exit(1);
  });
}
