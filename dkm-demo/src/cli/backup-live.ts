// Canlı DKM Takip PostgreSQL Veritabanı SALT OKUNUR (READ-ONLY) Akışlı (Streaming) Tam Yedekleme Aracı
// - Canlı veritabanına KESİNLİKLE yazma yapmaz (BEGIN TRANSACTION READ ONLY).
// - Büyük tabloları (Order, OrderItem, OrderActivity vb.) 500'lük paketlerle akışlı olarak .jsonl.gz dosyasına yazar.
// - Düşük RAM kullanır, her pakette ilerleme gösterir ve SHA-256 doğrulama üretir.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import pg from "pg";
import { REPO_ROOT } from "../config.ts";

function readLiveDatabaseUrl(): string | null {
  const envPath = path.join(REPO_ROOT, ".env");
  if (!fs.existsSync(envPath)) return null;
  const text = fs.readFileSync(envPath, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("DATABASE_URL=")) {
      let val = line.slice("DATABASE_URL=".length).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      return val;
    }
  }
  return null;
}

const TABLES: { name: string; orderBy?: string; batchSize?: number }[] = [
  { name: "User" },
  { name: "StatusColumn" },
  { name: "OrderLabel" },
  { name: "SystemSetting" },
  { name: "EtsyShop" },
  { name: "WarehouseStock", orderBy: "id", batchSize: 500 },
  { name: "Order", orderBy: "id", batchSize: 250 },
  { name: "OrderItem", orderBy: "id", batchSize: 250 },
  { name: "Comment", orderBy: "id", batchSize: 500 },
  { name: "OrderActivity", orderBy: "id", batchSize: 1000 },
  { name: "ChatMessage", orderBy: "id", batchSize: 500 },
];

async function main() {
  const outDirArg = process.argv.find((a) => a.startsWith("--out="));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = outDirArg ? path.resolve(outDirArg.split("=")[1]) : path.join(REPO_ROOT, "backups", `dkmtakip-${stamp}`);
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });

  const liveUrl = readLiveDatabaseUrl();
  if (!liveUrl) {
    console.error("[backup] .env içinde DATABASE_URL bulunamadı.");
    process.exit(1);
  }

  console.log("[backup] Canlı PostgreSQL veritabanına SALT OKUNUR (READ-ONLY) bağlanılıyor...");
  const client = new pg.Client({
    connectionString: liveUrl,
    ssl: liveUrl.includes("localhost") || liveUrl.includes("127.0.0.1") ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });

  const outFile = path.join(outDir, "live-db-snapshot.jsonl.gz");
  const hash = crypto.createHash("sha256");
  const gzip = zlib.createGzip({ level: 6 });
  const ws = fs.createWriteStream(outFile, { mode: 0o600 });
  gzip.on("data", (chunk) => hash.update(chunk));
  gzip.pipe(ws);

  const writeLine = (obj: any) =>
    new Promise<void>((resolve, reject) => {
      const ok = gzip.write(JSON.stringify(obj) + "\n", (err) => (err ? reject(err) : undefined));
      if (ok) resolve();
      else gzip.once("drain", resolve);
    });

  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await writeLine({ type: "meta", backupAt: new Date().toISOString(), mode: "READ_ONLY_SNAPSHOT" });

    const counts: Record<string, number> = {};

    for (const t of TABLES) {
      try {
        const cntRes = await client.query(`SELECT COUNT(*)::int AS c FROM "${t.name}"`);
        const total = cntRes.rows[0].c as number;
        counts[t.name] = total;

        if (!t.batchSize || total <= t.batchSize) {
          const res = await client.query(`SELECT * FROM "${t.name}"`);
          for (const row of res.rows) await writeLine({ table: t.name, row });
          console.log(`  ✓ ${t.name.padEnd(16)} : ${res.rows.length} kayıt`);
        } else {
          let written = 0;
          for (let offset = 0; offset < total; offset += t.batchSize) {
            const res = await client.query(`SELECT * FROM "${t.name}" ORDER BY "${t.orderBy}" ASC LIMIT $1 OFFSET $2`, [t.batchSize, offset]);
            for (const row of res.rows) await writeLine({ table: t.name, row });
            written += res.rows.length;
            if (written % (t.batchSize * 4) === 0 || written >= total) {
              console.log(`  … ${t.name.padEnd(16)} : ${written}/${total}`);
            }
          }
          console.log(`  ✓ ${t.name.padEnd(16)} : ${written} kayıt tamamlandı`);
        }
      } catch (e: any) {
        console.warn(`  ! ${t.name} atlandı (${e?.message})`);
      }
    }

    await client.query("COMMIT");
    await new Promise<void>((res, rej) => {
      ws.on("finish", res);
      ws.on("error", rej);
      gzip.end();
    });

    const st = fs.statSync(outFile);
    const sha256 = hash.digest("hex");
    const manifest = {
      backupAt: new Date().toISOString(),
      file: path.basename(outFile),
      format: "jsonl.gz",
      bytesCompressed: st.size,
      sha256,
      counts,
    };
    fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });

    console.log(`\n✅ Canlı DB yedeği tamamlandı: ${outFile}`);
    console.log(`   Boyut   : ${(st.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   SHA-256 : ${sha256}`);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error("[backup] Hata:", e?.message || e);
  process.exit(1);
});
