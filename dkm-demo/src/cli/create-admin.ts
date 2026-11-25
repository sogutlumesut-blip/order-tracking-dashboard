// Güvenli Demo Yönetici Oluşturma / Parola Güncelleme Aracı (npm run demo:create-admin)
// Gerçek DKM Takip DEMO veritabanında (DKM_DEMO/dkm-takip-demo.sqlite) çalışır.

import readline from "node:readline";
import path from "node:path";
import { createRequire } from "node:module";
import bcrypt from "bcryptjs";
import { REPO_ROOT } from "../config.ts";

const require = createRequire(import.meta.url);
const { PrismaClient: DemoPrismaClient } = require("../../generated/prisma-demo");

function ask(question: string, silent = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (!silent) {
      rl.question(question, (ans) => {
        rl.close();
        resolve(ans.trim());
      });
      return;
    }
    const stdin = process.stdin;
    process.stdout.write(question);
    let buf = "";
    const onData = (ch: Buffer) => {
      const s = ch.toString("utf8");
      if (s === "\n" || s === "\r" || s === "\u0004") {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        rl.close();
        resolve(buf);
      } else if (s === "\u0003") {
        process.exit(1);
      } else if (s === "\u007f" || s === "\b") {
        buf = buf.slice(0, -1);
      } else {
        buf += s;
      }
    };
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function main() {
  const demoDbPath = path.join(REPO_ROOT, "DKM_DEMO", "dkm-takip-demo.sqlite");
  const demoDb = new DemoPrismaClient({ datasources: { db: { url: `file:${demoDbPath}` } } });

  const username = process.env.DKM_ADMIN_USER || (await ask("Yönetici kullanıcı adı [demo-admin]: ")) || "demo-admin";
  const name = process.env.DKM_ADMIN_NAME || (await ask("Görünen ad [Demo Yönetici]: ")) || "Demo Yönetici";

  let password = process.env.DKM_ADMIN_PASSWORD || "";
  if (!password) {
    password = await ask("Yeni parola (en az 8 karakter): ", true);
    const confirm = await ask("Parolayı tekrar girin: ", true);
    if (password !== confirm) {
      console.error("Hata: Parolalar eşleşmiyor.");
      process.exit(1);
    }
  }
  if (password.length < 8) {
    console.error("Hata: Parola en az 8 karakter olmalıdır.");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);
  await demoDb.user.upsert({
    where: { username },
    update: { password: hash, name, role: "admin" },
    create: { username, password: hash, name, role: "admin" },
  });
  await demoDb.$disconnect();
  console.log(`✅ DKM Takip DEMO yönetici hesabı güncellendi: ${username} (rol: admin)`);
}

main().catch((e) => {
  console.error("[create-admin] Hata:", e?.message || e);
  process.exit(1);
});
