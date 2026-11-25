// Canlı DKM Takip veritabanından SALT OKUNUR (READ-ONLY) yöntemle seçilmiş gerçek siparişlerin
// anonimleştirilmiş test kopyalarını ayrı SQLite demo veritabanına aktarır.
// - Canlı veritabanına KESİNLİKLE yazma yapmaz (BEGIN TRANSACTION READ ONLY).
// - Kişisel bilgileri (müşteri adı, telefon, e-posta, adres, vergi no) anonimleştirir.
// - Sipariş numarası/barkod, SKU, ürün görseli, ölçü, malzeme, adet ve sütunları korur.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import bcrypt from "bcryptjs";
import pg from "pg";
import { REPO_ROOT } from "../config.ts";
import { defaultPaths, ensureDemoFolders } from "../paths.ts";

const require = createRequire(import.meta.url);
const { PrismaClient: DemoPrismaClient } = require("../../generated/prisma-demo");

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

function genPassword(len = 16): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

async function ensureDemoAdminAndSettings(demoDb: any, demoRoot: string) {
  const paths = defaultPaths(demoRoot);
  ensureDemoFolders(paths);

  // Varsayılan demo ayarlarını yaz (Windows Server yolu kasten BOŞ bırakılır; kullanıcı kendisi girer!)
  const defaults: Record<string, string> = {
    demo_server_designs_path: "",
    demo_path_previews: paths.previews,
    demo_path_details: paths.details,
    demo_path_approved: paths.approved,
    demo_path_print_ready: paths.printReady,
    demo_path_cache: paths.cache,
    demo_path_logs: paths.logs,
    demo_min_ppi: "45",
    demo_warn_ppi: "72",
    demo_print_ppi_max: "150",
    demo_max_file_gb: "12",
    demo_live_promotion_status: "locked",
    demo_live_promotion_note: "Canlı sisteme geçiş yönetici onayı olmadan kilitlidir.",
  };

  for (const [key, value] of Object.entries(defaults)) {
    await demoDb.systemSetting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }

  // Demo yönetici hesabı (canlı kullanıcılar kopyalanmaz; yalnızca izole demo-admin kullanılır)
  const adminUser = process.env.DKM_ADMIN_USER || "demo-admin";
  const existing = await demoDb.user.findUnique({ where: { username: adminUser } });
  let printedPass: string | null = null;
  if (!existing || process.env.DKM_ADMIN_PASSWORD) {
    const pass = process.env.DKM_ADMIN_PASSWORD || genPassword(16);
    const hash = await bcrypt.hash(pass, 10);
    await demoDb.user.upsert({
      where: { username: adminUser },
      update: { password: hash, role: "admin", name: "Demo Yönetici" },
      create: { username: adminUser, password: hash, role: "admin", name: "Demo Yönetici" },
    });
    if (!process.env.DKM_ADMIN_PASSWORD) printedPass = pass;
  }
  return { adminUser, printedPass };
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Math.min(200, Math.max(1, Number(limitArg.split("=")[1]))) : 40;
  const reset = process.argv.includes("--reset");

  const demoRoot = path.join(REPO_ROOT, "DKM_DEMO");
  const demoDbPath = path.join(demoRoot, "dkm-takip-demo.sqlite");
  const demoUrl = `file:${demoDbPath}`;

  const demoDb = new DemoPrismaClient({ datasources: { db: { url: demoUrl } } });
  const { adminUser, printedPass } = await ensureDemoAdminAndSettings(demoDb, demoRoot);

  const liveUrl = readLiveDatabaseUrl();
  if (!liveUrl) {
    console.error("[import] .env içinde DATABASE_URL bulunamadı. Canlı veritabanına bağlanılamadı.");
    await demoDb.$disconnect();
    process.exit(1);
  }

  console.log(`[import] Canlı veritabanına SALT OKUNUR (READ-ONLY) bağlanılıyor... (limit=${limit})`);
  const client = new pg.Client({
    connectionString: liveUrl,
    ssl: liveUrl.includes("localhost") || liveUrl.includes("127.0.0.1") ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  try {
    await client.connect();
    // Veritabanı düzeyinde salt okunur işlem kilidi — yazma kesinlikle imkansız!
    await client.query("BEGIN TRANSACTION READ ONLY");

    const colsRes = await client.query(`SELECT id, title, color, "order" FROM "StatusColumn" ORDER BY "order" ASC`);
    const labelsRes = await client.query(`SELECT id, name, color FROM "OrderLabel"`);
    const ordersRes = await client.query(
      `SELECT id, customer, phone, email, address, city, total, status, date, note, labels,
              "trackingNumber", "printNotes", "paymentMethod", barcode, "assignedTo",
              "externalId", source, "createdAt", "updatedAt"
       FROM "Order"
       ORDER BY "updatedAt" DESC
       LIMIT $1`,
      [limit],
    );

    const orderIds = ordersRes.rows.map((r: any) => r.id);
    let itemsRows: any[] = [];
    if (orderIds.length > 0) {
      const itemsRes = await client.query(
        `SELECT id, name, sku, url, quantity, image_src, material, dimensions, "productNote", "sampleData", "orderId"
         FROM "OrderItem"
         WHERE "orderId" = ANY($1::int[])`,
        [orderIds],
      );
      itemsRows = itemsRes.rows;
    }

    await client.query("COMMIT");
    await client.end();

    console.log(
      `[import] Salt okunur çekildi: ${colsRes.rows.length} sütun, ${labelsRes.rows.length} etiket, ${ordersRes.rows.length} sipariş, ${itemsRows.length} ürün kalemi.`,
    );

    if (reset) {
      await demoDb.whatsappTestLog.deleteMany({});
      await demoDb.draftRecord.deleteMany({});
      await demoDb.orderActivity.deleteMany({});
      await demoDb.comment.deleteMany({});
      await demoDb.orderItem.deleteMany({});
      await demoDb.order.deleteMany({});
    }

    // 1. Sütunları birebir kopyala + Taslak / Onay Beklemede / Onaylandı sütunlarını kontrol et
    for (const c of colsRes.rows) {
      await demoDb.statusColumn.upsert({
        where: { id: c.id },
        update: { title: c.title, color: c.color, order: c.order },
        create: { id: c.id, title: c.title, color: c.color, order: c.order },
      });
    }
    const hasTaslak = colsRes.rows.some((c: any) => /taslak|draft/i.test(c.id) || /taslak/i.test(c.title));
    if (!hasTaslak) {
      await demoDb.statusColumn.upsert({
        where: { id: "taslak" },
        update: {},
        create: { id: "taslak", title: "Taslak", color: "bg-amber-50", order: 2 },
      });
    }
    const hasOnayBek = colsRes.rows.some((c: any) => /onay.*bekl|awaiting_approval/i.test(c.id) || /onay bekle/i.test(c.title));
    if (!hasOnayBek) {
      await demoDb.statusColumn.upsert({
        where: { id: "onay_beklemede" },
        update: {},
        create: { id: "onay_beklemede", title: "Onay Beklemede", color: "bg-purple-50", order: 3 },
      });
    }
    const hasOnaylandi = colsRes.rows.some((c: any) => /onayland|approved/i.test(c.id) || /onaylandı/i.test(c.title));
    if (!hasOnaylandi) {
      await demoDb.statusColumn.upsert({
        where: { id: "onaylandi" },
        update: {},
        create: { id: "onaylandi", title: "Onaylandı", color: "bg-emerald-50", order: 4 },
      });
    }

    // 2. Etiketleri kopyala
    for (const l of labelsRes.rows) {
      await demoDb.orderLabel.upsert({
        where: { id: l.id },
        update: { name: l.name, color: l.color },
        create: { id: l.id, name: l.name, color: l.color },
      });
    }

    // 3. Siparişleri ANONİMLEŞTİREREK kopyala (kişisel veriler temizlenir, SKU/ölçü/görsel/malzeme/adet korunur)
    const itemsByOrder = new Map<number, any[]>();
    for (const it of itemsRows) {
      const list = itemsByOrder.get(it.orderId) || [];
      list.push(it);
      itemsByOrder.set(it.orderId, list);
    }

    let imported = 0;
    let skipped = 0;
    for (let i = 0; i < ordersRes.rows.length; i++) {
      const o = ordersRes.rows[i];
      const existingOrder = await demoDb.order.findUnique({ where: { id: o.id } });
      if (existingOrder) {
        skipped++;
        continue;
      }
      const anonIdx = i + 1;
      const orderItems = itemsByOrder.get(o.id) || [];

      await demoDb.order.create({
        data: {
          id: o.id,
          // KİŞİSEL BİLGİLER ANONİMLEŞTİRİLİR
          customer: `Test Müşteri #${anonIdx} (Anonim)`,
          phone: `+90 500 000 ${String(anonIdx).padStart(4, "0")} (TEST)`,
          email: `test-musteri-${anonIdx}@demo.invalid`,
          address: `Anonim Test Adresi${o.city ? ", " + o.city : ""}`,
          city: o.city || "İstanbul",
          // SİPARİŞ & ÜRÜN BİLGİLERİ KORUNUR
          total: o.total || "0 ₺",
          status: o.status,
          date: o.date ? new Date(o.date) : new Date(),
          note: o.note ? "[DEMO KOPYA] " + String(o.note).slice(0, 120) : null,
          labels: o.labels || "[]",
          printNotes: o.printNotes,
          paymentMethod: o.paymentMethod,
          barcode: o.barcode,
          assignedTo: o.assignedTo,
          externalId: o.externalId,
          source: o.source,
          invoiceStatus: "draft",
          items: {
            create: orderItems.map((it) => ({
              name: it.name || "Ürün",
              sku: it.sku || null,
              url: it.url || null,
              quantity: Number(it.quantity || 1),
              image_src: it.image_src || "",
              material: it.material || null,
              dimensions: it.dimensions || null,
              productNote: it.productNote || null,
              sampleData: it.sampleData || null,
            })),
          },
          activities: {
            create: {
              author: "DEMO İçe Aktarım",
              action: "DEMO_IMPORT",
              details: "Canlı sistemden salt okunur ve anonimleştirilmiş test kopyası oluşturuldu.",
            },
          },
        },
      });
      imported++;
    }

    console.log(`✅ Tamamlandı! Aktarılan gerçek (anonim) sipariş: ${imported}, Zaten mevcut: ${skipped}`);
    console.log(`   Demo DB: ${demoDbPath}`);
    if (printedPass) {
      console.log("\n========================================================");
      console.log("  DEMO YÖNETİCİ HESABI");
      console.log(`  Kullanıcı Adı : ${adminUser}`);
      console.log(`  Parola        : ${printedPass}`);
      console.log("========================================================\n");
    }
  } catch (e: any) {
    console.error("[import] Canlı veritabanı salt okunur bağlantı hatası:", e?.message || e);
    await client.end().catch(() => {});
    process.exit(1);
  } finally {
    await demoDb.$disconnect();
  }
}

main();
