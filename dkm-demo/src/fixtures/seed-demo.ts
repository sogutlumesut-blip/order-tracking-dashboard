// Gerçek görsel tasarım dosyaları (TIFF, PSD, PSB, JPG, PNG) ve 12 test siparişi üreteci.
// Orijinal tasarım arşivine dokunmaz; yalnızca DKM_DEMO/DESIGNS klasörüne yazar.

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { writePsd } from "./psd-writer.ts";
import type { Db } from "../db.ts";
import { addActivity, getPathsFromDb, initDefaultSettings } from "../db.ts";
import { ensureDemoFolders } from "../paths.ts";

// Her desen için ayırt edici, yüksek detaylı piksel satırı üreteci (gerçek baskı detayı test edilebilir)
function makePatternRow(seed: number, width: number, height: number) {
  const palette: [number, number, number][] = [
    [26, 77, 62],
    [184, 134, 72],
    [41, 65, 114],
    [148, 63, 75],
    [68, 92, 74],
    [195, 152, 92],
    [52, 74, 88],
    [164, 96, 62],
    [82, 62, 108],
    [172, 138, 68],
  ];
  const [br, bg, bb] = palette[seed % palette.length];
  const [ar, ag, ab] = palette[(seed + 3) % palette.length];

  return (y: number, out: Buffer) => {
    const ny = y / height;
    const band = Math.sin(ny * Math.PI * (6 + (seed % 5))) * 0.5 + 0.5;
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const wave = Math.sin((nx * 18 + ny * 8 + seed) * Math.PI) * 0.5 + 0.5;
      const fine = ((x * 7 + y * 13 + seed * 19) & 31) / 31; // %100 yakın detayda görülebilir ince doku
      const grid = x % 240 < 4 || y % 240 < 4 ? 0.25 : 0;
      const t = Math.min(1, Math.max(0, band * 0.55 + wave * 0.35 + fine * 0.1));
      let r = Math.round(br * (1 - t) + ar * t + grid * 180);
      let g = Math.round(bg * (1 - t) + ag * t + grid * 160);
      let b = Math.round(bb * (1 - t) + ab * t + grid * 120);
      out[x * 3] = r > 255 ? 255 : r;
      out[x * 3 + 1] = g > 255 ? 255 : g;
      out[x * 3 + 2] = b > 255 ? 255 : b;
    }
  };
}

function makeRawRgbBuffer(seed: number, width: number, height: number, channels: 3 | 4 = 3): Buffer {
  const buf = Buffer.allocUnsafe(width * height * channels);
  const rowFn = makePatternRow(seed, width, height);
  const rowRgb = Buffer.allocUnsafe(width * 3);
  for (let y = 0; y < height; y++) {
    rowFn(y, rowRgb);
    if (channels === 3) {
      rowRgb.copy(buf, y * width * 3);
    } else {
      const base = y * width * 4;
      for (let x = 0; x < width; x++) {
        buf[base + x * 4] = rowRgb[x * 3];
        buf[base + x * 4 + 1] = rowRgb[x * 3 + 1];
        buf[base + x * 4 + 2] = rowRgb[x * 3 + 2];
        buf[base + x * 4 + 3] = x < 40 || x > width - 40 ? 220 : 255;
      }
    }
  }
  return buf;
}

export async function generateTestDesignFixtures(designsDir: string, opts: { force?: boolean } = {}) {
  fs.mkdirSync(designsDir, { recursive: true });
  const created: string[] = [];

  const ensure = async (filename: string, fn: (full: string) => Promise<void>) => {
    const full = path.join(designsDir, filename);
    if (!opts.force && fs.existsSync(full)) return;
    await fn(full);
    created.push(filename);
  };

  // 1. TIFF RGB 8-bit
  await ensure("DKM-TROPIC-01.tif", async (full) => {
    const raw = makeRawRgbBuffer(1, 3600, 2400, 3);
    await sharp(raw, { raw: { width: 3600, height: 2400, channels: 3 } })
      .tiff({ compression: "lzw", xres: 150 / 25.4, yres: 150 / 25.4, resolutionUnit: "inch" })
      .toFile(full);
  });

  // 2. PSD RGB 8-bit RLE
  await ensure("DKM-FOREST-02.psd", async (full) => {
    await writePsd(full, {
      version: 1,
      width: 4000,
      height: 2800,
      colorMode: 3,
      depth: 8,
      compression: 1,
      ppi: 150,
      hasRealMergedData: true,
      fakeLayerBytes: 4096,
      rgbRow: makePatternRow(2, 4000, 2800),
    });
  });

  // 3. PSB CMYK 8-bit RLE
  await ensure("DKM-MARBLE-03.psb", async (full) => {
    await writePsd(full, {
      version: 2,
      width: 4800,
      height: 3200,
      colorMode: 4,
      depth: 8,
      compression: 1,
      ppi: 150,
      hasRealMergedData: true,
      fakeLayerBytes: 8192,
      rgbRow: makePatternRow(3, 4800, 3200),
    });
  });

  // 4. JPG sRGB
  await ensure("DKM-GEO-04.jpg", async (full) => {
    const raw = makeRawRgbBuffer(4, 3200, 2400, 3);
    await sharp(raw, { raw: { width: 3200, height: 2400, channels: 3 } }).jpeg({ quality: 90 }).toFile(full);
  });

  // 5. PNG RGBA
  await ensure("DKM-BOTANIC-05.png", async (full) => {
    const raw = makeRawRgbBuffer(5, 3600, 2700, 4);
    await sharp(raw, { raw: { width: 3600, height: 2700, channels: 4 } }).png({ compressionLevel: 3 }).toFile(full);
  });

  // 6. PSD 16-bit RGB Raw
  await ensure("DKM-ARCH-06.psd", async (full) => {
    await writePsd(full, {
      version: 1,
      width: 3000,
      height: 2250,
      colorMode: 3,
      depth: 16,
      compression: 0,
      ppi: 150,
      hasRealMergedData: true,
      rgbRow: makePatternRow(6, 3000, 2250),
    });
  });

  // 7. TIFF CMYK LZW
  await ensure("DKM-SAND-07.tiff", async (full) => {
    const raw = makeRawRgbBuffer(7, 3800, 2600, 3);
    await sharp(raw, { raw: { width: 3800, height: 2600, channels: 3 } })
      .toColourspace("cmyk")
      .tiff({ compression: "lzw", xres: 150 / 25.4, yres: 150 / 25.4, resolutionUnit: "inch" })
      .toFile(full);
  });

  // 8. PNG RGB
  await ensure("DKM-KIDS-08.png", async (full) => {
    const raw = makeRawRgbBuffer(8, 3000, 2000, 3);
    await sharp(raw, { raw: { width: 3000, height: 2000, channels: 3 } }).png({ compressionLevel: 3 }).toFile(full);
  });

  // 9. JPG high-res
  await ensure("DKM-VINTAGE-09.jpg", async (full) => {
    const raw = makeRawRgbBuffer(9, 4200, 2800, 3);
    await sharp(raw, { raw: { width: 4200, height: 2800, channels: 3 } }).jpeg({ quality: 90 }).toFile(full);
  });

  // 10. PSB RGB Raw
  await ensure("DKM-GOLD-10.psb", async (full) => {
    await writePsd(full, {
      version: 2,
      width: 3600,
      height: 2400,
      colorMode: 3,
      depth: 8,
      compression: 0,
      ppi: 120,
      hasRealMergedData: true,
      rgbRow: makePatternRow(10, 3600, 2400),
    });
  });

  // 11. Düşük çözünürlüklü JPG (yetersiz PPI testi)
  await ensure("DKM-LOWRES-11.jpg", async (full) => {
    const raw = makeRawRgbBuffer(11, 600, 400, 3);
    await sharp(raw, { raw: { width: 600, height: 400, channels: 3 } }).jpeg({ quality: 85 }).toFile(full);
  });

  // 12. Birleşik görüntüsü olmayan PSD (Maximize Compatibility kapalı - sahte başarı üretmemeli)
  await ensure("DKM-NOCOMP-12.psd", async (full) => {
    await writePsd(full, {
      version: 1,
      width: 1200,
      height: 800,
      colorMode: 3,
      depth: 8,
      compression: 1,
      hasRealMergedData: false,
      rgbRow: makePatternRow(12, 1200, 800),
    });
  });

  // Otomatik testler için ek kenar-durum dosyaları
  await ensure("DKM-DUP-99.jpg", async (full) => {
    const raw = makeRawRgbBuffer(13, 1000, 800, 3);
    await sharp(raw, { raw: { width: 1000, height: 800, channels: 3 } }).jpeg().toFile(full);
  });
  await ensure("DKM-DUP-99.tif", async (full) => {
    const raw = makeRawRgbBuffer(13, 1000, 800, 3);
    await sharp(raw, { raw: { width: 1000, height: 800, channels: 3 } }).tiff().toFile(full);
  });
  await ensure("DKM-CORRUPT-98.jpg", async (full) => {
    const raw = makeRawRgbBuffer(14, 800, 600, 3);
    const buf = await sharp(raw, { raw: { width: 800, height: 600, channels: 3 } }).jpeg().toBuffer();
    fs.writeFileSync(full, buf.subarray(0, Math.floor(buf.length * 0.35)));
  });
  await ensure("DKM-UNSUP-97.pdf", async (full) => {
    fs.writeFileSync(full, "%PDF-1.7\n% Demo unsupported vector file\n%%EOF\n");
  });

  return created;
}

export const DEMO_ORDERS = [
  {
    order_no: "DEMO-1001",
    dealer_code: "DKM",
    source: "DKM",
    customer: "Zeynep Karaca (TEST)",
    phone: "+90 500 100 00 01",
    email: "demo1@example.invalid",
    city: "İstanbul",
    total: "4.850 ₺",
    status: "pending_woo",
    labels: ["TASLAK TALEBİ VAR", "TIFF"],
    assigned_to: "Doğukan",
    barcode: "DKM-DEMO-1001",
    sku: "DKM-TROPIC-01",
    product_name: "Tropik Yapraklar Duvar Kağıdı",
    material: "Tekstil Tabanlı Dokulu",
    width: 150,
    height: 100,
    unit: "cm",
    note: "TIFF RGB test siparişi (cm)",
  },
  {
    order_no: "DEMO-1002",
    dealer_code: "DKM",
    source: "DKM",
    customer: "Mert Aydın (TEST)",
    phone: "+90 500 100 00 02",
    email: "demo2@example.invalid",
    city: "Ankara",
    total: "6.200 ₺",
    status: "pending_woo",
    labels: ["TASLAK TALEBİ VAR", "PSD"],
    assigned_to: "Yeşim",
    barcode: "DKM-DEMO-1002",
    sku: "DKM-FOREST-02",
    product_name: "Sisli Orman Panoramik",
    material: "Non-Woven Mat",
    width: 180,
    height: 125,
    unit: "cm",
    note: "PSD RGB 8-bit RLE test siparişi (cm)",
  },
  {
    order_no: "DEMO-1003",
    dealer_code: "DKM",
    source: "DKM",
    customer: "Selin Demirtaş (TEST)",
    phone: "+90 500 100 00 03",
    email: "demo3@example.invalid",
    city: "İzmir",
    total: "9.400 ₺",
    status: "pending_woo",
    labels: ["TASLAK TALEBİ VAR", "PSB", "CMYK"],
    assigned_to: "Mesut",
    barcode: "DKM-DEMO-1003",
    sku: "DKM-MARBLE-03",
    product_name: "Altın Damarlı Mermer",
    material: "Vinil Kabartmalı",
    width: 2.1,
    height: 1.4,
    unit: "m",
    note: "PSB CMYK test siparişi (metre)",
  },
  {
    order_no: "DEMO-1004",
    dealer_code: "DKM",
    source: "PrintMarkt",
    customer: "Burak Şahin (TEST)",
    phone: "+90 500 100 00 04",
    email: "demo4@example.invalid",
    city: "Bursa",
    total: "$285",
    status: "pending_pm",
    labels: ["Taslak Bekliyor", "JPG"],
    assigned_to: "Yasemin",
    barcode: "PM-DEMO-1004",
    sku: "DKM-GEO-04",
    product_name: "Geometrik Kemer Serisi",
    material: "Peel & Stick",
    width: 1400,
    height: 1050,
    unit: "mm",
    note: "JPG test siparişi (mm)",
  },
  {
    order_no: "DEMO-1005",
    dealer_code: "DKM",
    source: "Wayfair",
    customer: "Ece Yılmaz (TEST)",
    phone: "+90 500 100 00 05",
    email: "demo5@example.invalid",
    city: "Antalya",
    total: "$340",
    status: "pending_pm",
    labels: ["Taslak Bekliyor", "PNG"],
    assigned_to: "Doğukan",
    barcode: "WF-DEMO-1005",
    sku: "DKM-BOTANIC-05",
    product_name: "Botanik Bahçe Duvar Kağıdı",
    material: "Canvas Dokulu",
    width: 60,
    height: 45,
    unit: "in",
    note: "PNG RGBA test siparişi (inç)",
  },
  {
    order_no: "DEMO-1006",
    dealer_code: "BAYI-A",
    source: "DKM",
    customer: "Anadolu Dekor Bayi (TEST)",
    phone: "+90 500 100 00 06",
    email: "bayia1@example.invalid",
    city: "Konya",
    total: "7.100 ₺",
    status: "pending_woo",
    labels: ["BAYI-A", "PSD 16-bit"],
    assigned_to: "Yeşim",
    barcode: "DKM-DEMO-1006",
    sku: "DKM-ARCH-06",
    product_name: "Klasik Kemer Mimari",
    material: "Tekstil Tabanlı",
    width: 4.5,
    height: 3.3,
    unit: "ft",
    note: "PSD 16-bit test siparişi (ft) - BAYI-A",
  },
  {
    order_no: "DEMO-1007",
    dealer_code: "BAYI-A",
    source: "DKM",
    customer: "Ege İç Mimarlık (TEST)",
    phone: "+90 500 100 00 07",
    email: "bayia2@example.invalid",
    city: "Muğla",
    total: "8.300 ₺",
    status: "pending_woo",
    labels: ["BAYI-A", "TIFF CMYK"],
    assigned_to: "Mesut",
    barcode: "DKM-DEMO-1007",
    sku: "DKM-SAND-07",
    product_name: "Kum Taşı Doku",
    material: "Ağır Vinil",
    width: 170,
    height: 115,
    unit: "cm",
    note: "TIFF CMYK test siparişi (cm) - BAYI-A",
  },
  {
    order_no: "DEMO-1008",
    dealer_code: "BAYI-B",
    source: "PrintMarkt",
    customer: "Marmara Duvar Bayi (TEST)",
    phone: "+90 500 100 00 08",
    email: "bayib1@example.invalid",
    city: "Kocaeli",
    total: "3.900 ₺",
    status: "pending_pm",
    labels: ["BAYI-B", "PNG"],
    assigned_to: "Yasemin",
    barcode: "PM-DEMO-1008",
    sku: "DKM-KIDS-08",
    product_name: "Çocuk Odası Bulutlar",
    material: "Non-Woven",
    width: 140,
    height: 95,
    unit: "cm",
    note: "PNG test siparişi (cm) - BAYI-B",
  },
  {
    order_no: "DEMO-1009",
    dealer_code: "DKM",
    source: "DKM",
    customer: "Hakan Özkan (TEST)",
    phone: "+90 500 100 00 09",
    email: "demo9@example.invalid",
    city: "Eskişehir",
    total: "5.750 ₺",
    status: "pending_woo",
    labels: ["TASLAK TALEBİ VAR", "JPG"],
    assigned_to: "Doğukan",
    barcode: "DKM-DEMO-1009",
    sku: "DKM-VINTAGE-09",
    product_name: "Vintage Fresk",
    material: "Tekstil Dokulu",
    width: 190,
    height: 125,
    unit: "cm",
    note: "Yüksek çözünürlüklü JPG test siparişi",
  },
  {
    order_no: "DEMO-1010",
    dealer_code: "BAYI-B",
    source: "DKM",
    customer: "Kuzey Tasarım Bayi (TEST)",
    phone: "+90 500 100 00 10",
    email: "bayib2@example.invalid",
    city: "Samsun",
    total: "6.900 ₺",
    status: "pending_woo",
    labels: ["BAYI-B", "PSB"],
    assigned_to: "Yeşim",
    barcode: "DKM-DEMO-1010",
    sku: "DKM-GOLD-10",
    product_name: "Altın Varak Soyut",
    material: "Metalik Vinil",
    width: 160,
    height: 105,
    unit: "cm",
    note: "PSB RGB Raw test siparişi - BAYI-B",
  },
  {
    order_no: "DEMO-1011",
    dealer_code: "DKM",
    source: "DKM",
    customer: "Düşük Çözünürlük Testi (TEST)",
    phone: "+90 500 100 00 11",
    email: "demo11@example.invalid",
    city: "İstanbul",
    total: "5.200 ₺",
    status: "pending_woo",
    labels: ["DÜŞÜK PPI TEST"],
    assigned_to: "Mesut",
    barcode: "DKM-DEMO-1011",
    sku: "DKM-LOWRES-11",
    product_name: "Düşük Çözünürlük Kontrol Deseni",
    material: "Non-Woven",
    width: 400,
    height: 280,
    unit: "cm",
    note: "600x400px kaynak -> ~3.8 PPI (yetersiz çözünürlük uyarısı vermeli, otomatik gönderim yapmamalı)",
  },
  {
    order_no: "DEMO-1012",
    dealer_code: "DKM",
    source: "DKM",
    customer: "Uyumsuz PSD Testi (TEST)",
    phone: "+90 500 100 00 12",
    email: "demo12@example.invalid",
    city: "İstanbul",
    total: "4.100 ₺",
    status: "pending_woo",
    labels: ["HATA TESTİ"],
    assigned_to: "Mesut",
    barcode: "DKM-DEMO-1012",
    sku: "DKM-NOCOMP-12",
    product_name: "Birleşik Görüntüsüz PSD Testi",
    material: "Tekstil Tabanlı",
    width: 220,
    height: 160,
    unit: "cm",
    note: "Maximize Compatibility kapalı PSD: sahte başarı göstermemeli, açık hata vermeli",
  },
];

export async function seedDemoOrders(db: Db, demoRoot: string, opts: { reset?: boolean } = {}) {
  initDefaultSettings(db, demoRoot);
  const paths = getPathsFromDb(db, demoRoot);
  ensureDemoFolders(paths);
  const createdFiles = await generateTestDesignFixtures(paths.designs);

  if (opts.reset) {
    db.exec(`
      DELETE FROM whatsapp_test_logs;
      DELETE FROM activities;
      DELETE FROM jobs;
      DELETE FROM drafts;
      DELETE FROM orders;
    `);
    for (const dir of [paths.previews, paths.details, paths.approved, paths.printReady, paths.cache]) {
      if (fs.existsSync(dir)) {
        for (const ent of fs.readdirSync(dir)) {
          fs.rmSync(path.join(dir, ent), { recursive: true, force: true });
        }
      }
    }
  }

  const ins = db.prepare(`
    INSERT OR IGNORE INTO orders (
      order_no, dealer_code, source, customer, phone, email, city, total, status,
      labels, assigned_to, barcode, sku, product_name, material, width, height, unit, dimensions_raw, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  const tx = db.transaction(() => {
    for (const o of DEMO_ORDERS) {
      const dimRaw = `${o.width}x${o.height} ${o.unit}`;
      const r = ins.run(
        o.order_no,
        o.dealer_code,
        o.source,
        o.customer,
        o.phone,
        o.email,
        o.city,
        o.total,
        o.status,
        JSON.stringify(o.labels),
        o.assigned_to,
        o.barcode,
        o.sku,
        o.product_name,
        o.material,
        o.width,
        o.height,
        o.unit,
        dimRaw,
        o.note,
      );
      if (r.changes > 0) {
        inserted++;
        addActivity(db, Number(r.lastInsertRowid), "DEMO Kurulum", "Test Siparişi Oluşturuldu", `SKU: ${o.sku}, Ölçü: ${dimRaw}`);
      }
    }
  });
  tx();

  return { inserted, totalOrders: DEMO_ORDERS.length, createdFiles };
}
