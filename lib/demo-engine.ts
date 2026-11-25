// DKM Takip DEMO - Gerçek Görsel İşleme Motoru & Windows Server Bağlantı Köprüsü
// Mevcut dkm-demo/src/engine/* motorunu doğrudan kullanır.
// - Canlı veritabanına, canlı WhatsApp'a veya canlı baskı klasörlerine asla yazmaz.
// - Windows Server tasarım klasörüne yalnızca SALT OKUNUR erişir.
// - Sipariş kartındaki küçük ürün görselini asla baskı kaynağı olarak kullanmaz.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { db, isDemoMode } from "@/lib/prisma";
import {
  probeSource,
  ensureWorkImage,
  ensureProxy,
  defaultCrop,
  validateCrop,
  computePpi,
  renderPreview,
  renderDetail,
  renderPrint,
  computeTilePpi,
  renderTiledPreview,
  renderTiledDetail,
  renderTiledPrint,
  DEFAULT_ENGINE,
  SUPPORTED_EXTS,
} from "../dkm-demo/src/engine/index.ts";
import type { Crop, EngineSettings, TileConfig } from "../dkm-demo/src/engine/index.ts";
import { findDesignBySku, validateSku, candidateSkus } from "../dkm-demo/src/engine/sku-finder.ts";
import { parseDimensionString, toInches, formatDim } from "../dkm-demo/src/engine/units.ts";
import { EngineError, toEngineError } from "../dkm-demo/src/engine/errors.ts";
import { defaultPaths, ensureDemoFolders, validateOutputPath, appendLog } from "../dkm-demo/src/paths.ts";
import { extractGoogleDriveId, fetchCustomDesignToCache, findCustomDesignUrl } from "../dkm-demo/src/engine/drive-fetch.ts";
import { compareVisualSignatures, computeVisualSignature } from "../dkm-demo/src/engine/visual-hash.ts";

function resolveStorageRoot(): string {
  if (isDemoMode()) return path.resolve(process.cwd(), "DKM_DEMO");
  const preferred = process.env.DKM_STORAGE_ROOT
    ? path.resolve(process.env.DKM_STORAGE_ROOT)
    : path.resolve(process.cwd(), "DKM_STORAGE");
  try {
    fs.mkdirSync(preferred, { recursive: true });
    return preferred;
  } catch {
    const fallback = path.join(os.tmpdir(), "DKM_STORAGE");
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

export const DEMO_ROOT = resolveStorageRoot();

// Canlıda PostgreSQL, demo modda yerel SQLite Prisma istemcisini döndürür
export function getDemoDb(): any {
  return db as any;
}

export async function getDemoSettingsMap(): Promise<Record<string, string>> {
  const ddb = getDemoDb();
  const rows = (await ddb.systemSetting.findMany()) as { key: string; value: string }[];
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

export async function getDemoPaths() {
  const s = await getDemoSettingsMap();
  const def = defaultPaths(DEMO_ROOT);
  const paths = {
    // Windows Server veya yerel salt-okunur tasarım klasörü — kullanıcı tarafından girilir, ASLA mkdir yapılmaz!
    designs: (s.demo_server_designs_path || "").trim(),
    previews: path.resolve(s.demo_path_previews || def.previews),
    details: path.resolve(s.demo_path_details || def.details),
    approved: path.resolve(s.demo_path_approved || def.approved),
    printReady: path.resolve(s.demo_path_print_ready || def.printReady),
    cache: path.resolve(s.demo_path_cache || def.cache),
    logs: path.resolve(s.demo_path_logs || def.logs),
  };
  for (const dir of [paths.previews, paths.details, paths.approved, paths.printReady, paths.cache, paths.logs]) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // Salt-okunur bulut dosya sisteminde sessizce geç
    }
  }
  return paths;
}

export async function getDemoEngineSettings(): Promise<EngineSettings> {
  const s = await getDemoSettingsMap();
  return {
    ...DEFAULT_ENGINE,
    minPpi: Number(s.demo_min_ppi || DEFAULT_ENGINE.minPpi),
    warnPpi: Number(s.demo_warn_ppi || DEFAULT_ENGINE.warnPpi),
    printPpiMax: Number(s.demo_print_ppi_max || DEFAULT_ENGINE.printPpiMax),
    maxFileBytes: Math.max(1, Number(s.demo_max_file_gb || 12)) * 1024 ** 3,
  };
}

// === WINDOWS SERVER BAĞLANTI TESTİ (SALT OKUNUR, SAHTE BAŞARI YOK) ===
export async function testServerConnection(rawPath: string) {
  const target = (rawPath || "").trim();
  if (!target) {
    return {
      ok: false,
      configured: false,
      error: "Server klasör yolu girilmedi. Lütfen Windows Server ağ paylaşımının bağlı klasör yolunu girin (örn. /Volumes/Tasarimlar).",
    };
  }
  const resolved = path.resolve(target);
  try {
    const st = await fs.promises.stat(resolved);
    if (!st.isDirectory()) {
      return { ok: false, configured: true, path: resolved, error: "Girilen yol bir klasör değil." };
    }
    await fs.promises.access(resolved, fs.constants.R_OK);
    const entries = await fs.promises.readdir(resolved, { withFileTypes: true });
    const visible = entries.filter((e) => !e.name.startsWith(".") && !e.name.startsWith("~$"));
    return {
      ok: true,
      configured: true,
      readOnlyMode: true,
      path: resolved,
      topLevelCount: visible.length,
      sampleEntries: visible.slice(0, 8).map((e) => ({ name: e.name, isDir: e.isDirectory() })),
    };
  } catch (e: any) {
    return {
      ok: false,
      configured: true,
      path: resolved,
      error: `Klasöre salt okunur erişilemedi (${e?.code || e?.message}). Windows Server paylaşımının bağlı (mounted) olduğundan emin olun.`,
    };
  }
}

// === WINDOWS SERVER TASARIM KLASÖRLERİNİ İNDEKSLE (SALT OKUNUR, HIZLI BAŞLIK OKUMA) ===
export async function indexServerDesigns(rawPath?: string) {
  const ddb = getDemoDb();
  const s = await getDemoSettingsMap();
  const target = (rawPath ?? s.demo_server_designs_path ?? "").trim();
  const conn = await testServerConnection(target);
  if (!conn.ok) {
    throw new EngineError("SOURCE_UNAVAILABLE", conn.error || "Server bağlantısı yok");
  }

  const rootDir = conn.path!;
  const engSettings = await getDemoEngineSettings();
  const t0 = Date.now();
  const allFiles: { full: string; name: string; ext: string; skuStem: string }[] = [];
  const errors: { file: string; error: string }[] = [];

  // Mevcut indeksi mtime bazlı önbellek olarak tut (tekrar indekslemede çok hızlı olur)
  const existingRows = (await ddb.designIndexEntry.findMany()) as any[];
  const existingMap = new Map<string, any>(existingRows.map((r) => [r.filePath, r]));

  async function walk(dir: string, depth: number) {
    if (depth > 8) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (e: any) {
      errors.push({ file: dir, error: e?.message || "Klasör okunamadı" });
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".") || ent.name.startsWith("~$")) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(full, depth + 1);
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (!SUPPORTED_EXTS.includes(ext)) continue;
        const skuStem = path.basename(ent.name, ext).trim();
        allFiles.push({ full, name: ent.name, ext, skuStem });
      }
    }
  }

  await walk(rootDir, 0);

  const found: any[] = [];
  let hashedCount = 0;
  const CONCURRENCY = 6;
  let cursor = 0;

  async function worker() {
    while (cursor < allFiles.length) {
      const item = allFiles[cursor++];
      try {
        const st = await fs.promises.stat(item.full);
        const prev = existingMap.get(item.full);
        if (prev && Math.abs((prev.mtimeMs || 0) - st.mtimeMs) < 10 && prev.visualHash) {
          found.push({
            sku: item.skuStem,
            filePath: item.full,
            fileName: item.name,
            format: prev.format,
            sizeBytes: st.size,
            widthPx: prev.widthPx,
            heightPx: prev.heightPx,
            colorSpace: prev.colorSpace,
            depth: prev.depth,
            visualHash: prev.visualHash,
            mtimeMs: st.mtimeMs,
          });
          hashedCount++;
          continue;
        }

        const info = await probeSource(item.full, engSettings);
        let visualHash: string | null = prev?.visualHash || null;
        // JPG/PNG/TIFF dosyaları için (250 MB altı) yerel görsel parmak izi çıkar
        if (!visualHash && ["jpeg", "png", "tiff"].includes(info.format) && info.sizeBytes <= 250 * 1024 * 1024) {
          try {
            visualHash = await computeVisualSignature(item.full);
            hashedCount++;
          } catch {}
        } else if (visualHash) {
          hashedCount++;
        }

        found.push({
          sku: item.skuStem,
          filePath: item.full,
          fileName: item.name,
          format: info.format.toUpperCase(),
          sizeBytes: info.sizeBytes,
          widthPx: info.width,
          heightPx: info.height,
          colorSpace: info.space,
          depth: info.depth,
          visualHash,
          mtimeMs: info.mtimeMs,
        });
      } catch (e: any) {
        const st = await fs.promises.stat(item.full).catch(() => null);
        found.push({
          sku: item.skuStem,
          filePath: item.full,
          fileName: item.name,
          format: item.ext.replace(".", "").toUpperCase() + " (HATA)",
          sizeBytes: st?.size || 0,
          widthPx: null,
          heightPx: null,
          colorSpace: null,
          depth: null,
          visualHash: null,
          mtimeMs: st?.mtimeMs || 0,
        });
        errors.push({ file: item.name, error: e?.message || "Okunamadı" });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, allFiles.length)) }, () => worker()));

  const now = new Date();
  await ddb.designIndexEntry.deleteMany({});
  for (const item of found) {
    await ddb.designIndexEntry.create({
      data: { ...item, indexedAt: now },
    });
  }
  await ddb.systemSetting.upsert({
    where: { key: "demo_server_last_indexed_at" },
    update: { value: now.toISOString() },
    create: { key: "demo_server_last_indexed_at", value: now.toISOString() },
  });
  await ddb.systemSetting.upsert({
    where: { key: "demo_server_indexed_count" },
    update: { value: String(found.length) },
    create: { key: "demo_server_indexed_count", value: String(found.length) },
  });

  return {
    ok: true,
    path: rootDir,
    indexedCount: found.length,
    hashedCount,
    errorCount: errors.length,
    errors: errors.slice(0, 20),
    durationMs: Date.now() - t0,
    lastIndexedAt: now.toISOString(),
  };
}

// === SKU İLE SERVER DOSYASI ARA ===
export async function searchDesignBySkuOnServer(rawSku: string) {
  const ddb = getDemoDb();
  const s = await getDemoSettingsMap();
  const designsPath = (s.demo_server_designs_path || "").trim();
  const lastIndexedAt = s.demo_server_last_indexed_at || null;
  const query = (rawSku || "").trim();
  if (!query) throw new EngineError("INVALID_SKU", "Aranacak SKU boş olamaz");

  // Önce indekste ara (büyük/küçük harf duyarsız)
  const allIndexed = (await ddb.designIndexEntry.findMany()) as any[];
  const qLower = query.toLowerCase();
  const exactIndexed = allIndexed.filter((e) => e.sku.toLowerCase() === qLower);
  const partialIndexed =
    exactIndexed.length > 0 ? exactIndexed : allIndexed.filter((e) => e.sku.toLowerCase().includes(qLower) || e.fileName.toLowerCase().includes(qLower));

  if (partialIndexed.length > 0) {
    return {
      ok: true,
      source: "index",
      configuredPath: designsPath,
      lastIndexedAt,
      matches: partialIndexed.slice(0, 25),
    };
  }

  // İndekste yoksa ve server yolu yapılandırılmışsa canlı salt-okunur arama yap
  if (!designsPath) {
    return {
      ok: false,
      source: "none",
      configuredPath: "",
      lastIndexedAt,
      error: "Windows Server tasarım klasörü yapılandırılmadı. Önce Ayarlar > Server Bağlantı Ayarları'ndan klasör yolunu girin.",
      matches: [],
    };
  }

  try {
    const filePath = await findDesignBySku(designsPath, query);
    const info = await probeSource(filePath, await getDemoEngineSettings());
    return {
      ok: true,
      source: "live_readonly_scan",
      configuredPath: designsPath,
      lastIndexedAt,
      matches: [
        {
          sku: query,
          filePath,
          fileName: path.basename(filePath),
          format: info.format.toUpperCase(),
          sizeBytes: info.sizeBytes,
          widthPx: info.width,
          heightPx: info.height,
          colorSpace: info.space,
          depth: info.depth,
          indexedAt: lastIndexedAt,
        },
      ],
    };
  } catch (e: any) {
    return {
      ok: false,
      source: "live_readonly_scan",
      configuredPath: designsPath,
      lastIndexedAt,
      error: e?.message || "Dosya bulunamadı",
      code: e?.code || "DESIGN_NOT_FOUND",
      matches: [],
    };
  }
}

function cpuSnap() {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    const t = c.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

function parseOrderDimensions(rawDim: string | null | undefined, source?: string | null, barcode?: string | null) {
  const s = (rawDim || "").trim();
  if (!s || /^sample$/i.test(s) || /^roll$/i.test(s) || s === "-") {
    throw new EngineError("INVALID_DIMENSIONS", `Sipariş ölçüsü otomatik taslak için uygun değil: "${s || "boş"}"`);
  }
  const isWayfair = (source || "").toLowerCase() === "wayfair" || (barcode || "").toUpperCase().startsWith("WF-");
  return parseDimensionString(s, isWayfair ? "in" : "cm");
}

// === GERÇEK SİPARİŞ İÇİN OTOMATİK TASLAK ÜRETİMİ (PERFORMANS METRİKLERİYLE) ===
export async function generateDraftForOrder(
  orderId: number,
  opts: {
    actor: string;
    publicBaseUrl: string;
    crop?: Crop;
    detailCenter?: { cx: number; cy: number };
    autoSendWhatsApp?: boolean;
    overrideSku?: string;
    overrideDimensions?: string;
    overrideSourcePath?: string;
    rememberSkuMapping?: boolean;
    forceDrive?: boolean;
    layoutMode?: "mural" | "seamless";
    tileConfig?: TileConfig;
  },
) {
  const ddb = getDemoDb();
  const paths = await getDemoPaths();
  const engSettings = await getDemoEngineSettings();
  const tTotal0 = Date.now();
  const cpu0 = cpuSnap();
  let peakRss = process.memoryUsage().rss;
  const trackMem = () => {
    const r = process.memoryUsage().rss;
    if (r > peakRss) peakRss = r;
  };

  const order = await ddb.order.findUnique({
    where: { id: orderId },
    include: { items: true, drafts: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!order) throw new EngineError("INTERNAL", `Sipariş bulunamadı (#${orderId})`);

  const item = order.items[0];
  const rawSku = (opts.overrideSku ?? item?.sku ?? "").trim();
  const rawDim = (opts.overrideDimensions ?? item?.dimensions ?? "").trim();
  const customDriveUrl = findCustomDesignUrl(item);

  try {
    // 1. Ölçüyü doğrula
    const dim = parseOrderDimensions(rawDim, order.source, order.barcode);
    const sku = rawSku ? validateSku(rawSku) : `ORD-${order.id}`;
    const inch = toInches(dim);
    const targetAspect = inch.w / inch.h;

    // 2. Tasarım kaynağını bul: (a) Manuel/Görsel eşleşme -> (b) SKU Hafızası -> (c) Windows Server -> (d) Google Drive özel tasarım linki
    const tFind0 = Date.now();
    let sourcePath: string | null = null;
    let sourceOrigin = "server";

    if (opts.overrideSourcePath && fs.existsSync(opts.overrideSourcePath)) {
      sourcePath = opts.overrideSourcePath;
      sourceOrigin = "visual_match";
      if (opts.rememberSkuMapping && rawSku) {
        await saveSkuMapping(sku, sourcePath, "visual_match");
      }
    } else if (opts.forceDrive && customDriveUrl) {
      const dl = await fetchCustomDesignToCache(customDriveUrl, paths.cache);
      sourcePath = dl.filePath;
      sourceOrigin = dl.sourceLabel;
    } else {
      // (b) Öğrenilmiş SKU ↔ Server eşleşme hafızası
      const savedMap = await ddb.skuMapping.findUnique({ where: { sku } });
      if (savedMap && fs.existsSync(savedMap.filePath)) {
        sourcePath = savedMap.filePath;
        sourceOrigin = "sku_memory";
      }

      // (c) Windows Server indeks / salt okunur arama
      if (!sourcePath && paths.designs) {
        const cands = candidateSkus(sku).map((c) => c.toLowerCase());
        const allIndexed = (await ddb.designIndexEntry.findMany()) as any[];
        for (const c of cands) {
          const hits = allIndexed.filter((e) => e.sku.toLowerCase() === c && fs.existsSync(e.filePath));
          if (hits.length > 1) {
            throw new EngineError(
              "MULTIPLE_MATCH",
              `SKU "${sku}" için Server'da birden fazla dosya bulundu: ${hits.map((m: any) => m.fileName).join(", ")}`,
            );
          }
          if (hits.length === 1) {
            sourcePath = hits[0].filePath;
            break;
          }
        }
        if (!sourcePath) {
          try {
            sourcePath = await findDesignBySku(paths.designs, sku);
          } catch (e: any) {
            // Eğer SKU Server'da yoksa ve siparişte Google Drive özel tasarım linki varsa Drive'dan çek!
            if (e?.code === "DESIGN_NOT_FOUND" && customDriveUrl) {
              const dl = await fetchCustomDesignToCache(customDriveUrl, paths.cache);
              sourcePath = dl.filePath;
              sourceOrigin = dl.sourceLabel;
            } else {
              throw e;
            }
          }
        }
      } else if (!sourcePath && customDriveUrl) {
        // Server yapılandırılmamış olsa bile Google Drive özel tasarım linki varsa doğrudan Drive'dan çek
        const dl = await fetchCustomDesignToCache(customDriveUrl, paths.cache);
        sourcePath = dl.filePath;
        sourceOrigin = dl.sourceLabel;
      }

      if (!sourcePath) {
        throw new EngineError(
          "SOURCE_UNAVAILABLE",
          "Windows Server tasarım klasörü yapılandırılmadı ve siparişte Google Drive linki yok! Ayarlar > Server Bağlantı Ayarları'ndan klasör yolunu girin.",
        );
      }
    }
    const findMs = Date.now() - tFind0;
    void sourceOrigin;

    // 3. Orijinal dosyayı Photoshop kullanmadan aç, oku ve proxy hazırla (dosya okuma süresi ölçülür)
    const tRead0 = Date.now();
    const info = await probeSource(sourcePath, engSettings);
    trackMem();
    const work = await ensureWorkImage(info, paths.cache, engSettings);
    trackMem();
    const proxy = await ensureProxy(info, work, paths.cache, engSettings);
    trackMem();
    const readMs = Date.now() - tRead0;

    // 4. Layout modu: Mural (kırp/ölçekle) veya Seamless / Takipli Desen (tekrarla)
    const autoSeamless = /seamless|takipli|pattern|repeat/i.test(`${item?.name || ""} ${path.basename(sourcePath)}`);
    const layoutMode: "mural" | "seamless" = opts.layoutMode || (autoSeamless ? "seamless" : "mural");
    const tile: TileConfig | null =
      layoutMode === "seamless"
        ? {
            repeatWidthInch: Math.max(0.5, Number(opts.tileConfig?.repeatWidthInch || inch.w)),
            offsetX: Number(opts.tileConfig?.offsetX || 0),
            offsetY: Number(opts.tileConfig?.offsetY || 0),
            halfDrop: !!opts.tileConfig?.halfDrop,
          }
        : null;

    const crop: Crop = opts.crop
      ? validateCrop(opts.crop, info.width, info.height, targetAspect)
      : defaultCrop(info.width, info.height, targetAspect);
    const ppi = layoutMode === "seamless" && tile ? computeTilePpi(info, dim, tile, engSettings) : computePpi(crop, dim, engSettings);

    // 5. Çıktı klasörlerinin tasarım arşivine (veya demo modda canlı klasörlere) yazmasını engelle
    if (isDemoMode()) {
      validateOutputPath(paths.previews, paths.designs, DEMO_ROOT);
      validateOutputPath(paths.details, paths.designs, DEMO_ROOT);
    } else if (paths.designs) {
      const rd = path.resolve(paths.designs);
      for (const outDir of [paths.previews, paths.details]) {
        const ro = path.resolve(outDir);
        if (ro === rd || ro.startsWith(rd + path.sep)) {
          throw new EngineError("OUTPUT_PATH_FORBIDDEN", "Güvenlik: Çıktı klasörü salt-okunur tasarım arşivi içinde olamaz.");
        }
      }
    }

    const nextVersion = (order.drafts[0]?.version || 0) + 1;
    const orderTag = String(order.barcode || order.externalId || order.id).replace(/[^A-Za-z0-9_-]/g, "_");
    const previewPath = path.join(paths.previews, `ORD_${order.id}_${orderTag}_v${nextVersion}_preview.jpg`);
    const detailPath = path.join(paths.details, `ORD_${order.id}_${orderTag}_v${nextVersion}_detail100.jpg`);

    // 6. JPG taslak + %100 yakın detay üret (taslak oluşturma süresi ölçülür)
    const tRender0 = Date.now();
    if (layoutMode === "seamless" && tile) {
      await renderTiledPreview(info, work, proxy, dim, tile, ppi, { orderNo: String(order.barcode || order.id), sku, version: nextVersion, dim }, previewPath, engSettings);
      await renderTiledDetail(info, work, dim, tile, ppi, detailPath, engSettings);
    } else {
      await renderPreview(info, work, proxy, crop, ppi, { orderNo: String(order.barcode || order.id), sku, version: nextVersion, dim }, previewPath, engSettings);
      await renderDetail(info, work, crop, ppi, detailPath, engSettings, opts.detailCenter);
    }
    trackMem();
    const renderMs = Date.now() - tRender0;
    const totalMs = Date.now() - tTotal0;

    const cpu1 = cpuSnap();
    const dTotal = Math.max(1, cpu1.total - cpu0.total);
    const cpuPercent = Number((((dTotal - (cpu1.idle - cpu0.idle)) / dTotal) * 100).toFixed(1));
    const peakRssMb = Number((peakRss / 1024 / 1024).toFixed(1));
    const outputBytes =
      (fs.existsSync(previewPath) ? fs.statSync(previewPath).size : 0) +
      (fs.existsSync(detailPath) ? fs.statSync(detailPath).size : 0);

    const approvalToken = crypto.randomBytes(20).toString("hex");
    const warnings = [...info.warnings];
    if (ppi.status === "warn") warnings.push(`Efektif PPI önerilenin altında (${ppi.effectivePpi.toFixed(1)} < ${engSettings.warnPpi})`);
    if (ppi.status === "low") warnings.push(`YETERSİZ ÇÖZÜNÜRLÜK: ${ppi.effectivePpi.toFixed(1)} PPI (asgari ${engSettings.minPpi} PPI)`);

    // Eski sürümleri geçersiz kıl (superseded)
    await ddb.draftRecord.updateMany({
      where: { orderId: order.id, status: { in: ["ready", "sent", "revision_requested"] } },
      data: { status: "superseded" },
    });

    const draft = await ddb.draftRecord.create({
      data: {
        orderId: order.id,
        version: nextVersion,
        sku,
        dimensionsRaw: formatDim(dim),
        width: dim.width,
        height: dim.height,
        unit: dim.unit,
        sourcePath,
        sourceFormat: info.format,
        sourceWidth: info.width,
        sourceHeight: info.height,
        sourceSpace: info.space,
        sourceBytes: info.sizeBytes,
        cropX: crop.x,
        cropY: crop.y,
        cropW: crop.w,
        cropH: crop.h,
        layoutMode,
        tileConfig: tile ? JSON.stringify(tile) : null,
        effectivePpi: ppi.effectivePpi,
        outPpi: ppi.outPpi,
        ppiStatus: ppi.status,
        outWidth: ppi.outW,
        outHeight: ppi.outH,
        proxyPath: proxy.proxyPath,
        previewPath,
        detailPath,
        status: ppi.status === "low" ? "failed" : "ready",
        approvalToken,
        errorCode: ppi.status === "low" ? "LOW_RESOLUTION" : null,
        errorMessage: ppi.status === "low" ? `Yetersiz çözünürlük: ${ppi.effectivePpi.toFixed(1)} PPI` : null,
        warnings: JSON.stringify(warnings),
        findMs,
        readMs,
        renderMs,
        totalMs,
        peakRssMb,
        cpuPercent,
        outputBytes,
      },
    });

    await ddb.orderActivity.create({
      data: {
        orderId: order.id,
        author: opts.actor,
        action: ppi.status === "low" ? "DRAFT_LOW_PPI" : "DRAFT_CREATED",
        details: `Taslak v${nextVersion} (${info.format.toUpperCase()}, ${info.width}×${info.height}px) • Efektif PPI: ${ppi.effectivePpi.toFixed(1)} • Bulma: ${findMs}ms, Okuma: ${readMs}ms, Oluşturma: ${renderMs}ms, RAM: ${peakRssMb}MB`,
      },
    });

    appendLog(paths.logs, "demo-drafts.jsonl", {
      orderId: order.id,
      sku,
      version: nextVersion,
      format: info.format,
      sourceBytes: info.sizeBytes,
      findMs,
      readMs,
      renderMs,
      totalMs,
      peakRssMb,
      cpuPercent,
      effectivePpi: Number(ppi.effectivePpi.toFixed(1)),
      outputBytes,
    });

    let whatsappLog = null;
    if (ppi.status !== "low" && opts.autoSendWhatsApp) {
      whatsappLog = await createTestWhatsAppForDraft(order.id, draft.id, opts.publicBaseUrl, opts.actor);
    }

    return { ok: ppi.status !== "low", draft, whatsappLog };
  } catch (e: any) {
    const err = toEngineError(e);
    const nextVersion = (order.drafts[0]?.version || 0) + 1;
    const failedDraft = await ddb.draftRecord.create({
      data: {
        orderId: order.id,
        version: nextVersion,
        sku: rawSku || "-",
        dimensionsRaw: rawDim || "-",
        status: "failed",
        errorCode: err.code,
        errorMessage: err.message,
        totalMs: Date.now() - tTotal0,
        peakRssMb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)),
      },
    });
    await ddb.orderActivity.create({
      data: {
        orderId: order.id,
        author: opts.actor,
        action: "DRAFT_ERROR",
        details: `Otomatik taslak hatası [${err.code}]: ${err.message}`,
      },
    });
    return { ok: false, errorCode: err.code, error: err.message, draft: failedDraft };
  }
}

export async function createTestWhatsAppForDraft(orderId: number, draftId: number, publicBaseUrl: string, actor: string) {
  const ddb = getDemoDb();
  const order = await ddb.order.findUnique({ where: { id: orderId } });
  const draft = await ddb.draftRecord.findUnique({ where: { id: draftId } });
  if (!order || !draft) throw new EngineError("INTERNAL", "Sipariş veya taslak bulunamadı");
  if (draft.ppiStatus === "low" || draft.status === "failed") {
    throw new EngineError("INTERNAL", "Hatalı veya yetersiz çözünürlüklü taslak gönderilemez.");
  }

  const approvalUrl = `${publicBaseUrl}/approve/${draft.approvalToken}`;
  const previewUrl = `${publicBaseUrl}/api/demo/files/preview/${draft.id}`;
  const message =
    `[DEMO TEST — GERÇEK MÜŞTERİYE GÖNDERİLMEDİ]\n` +
    `Merhaba ${order.customer},\n` +
    `#${order.barcode || order.id} numaralı (${draft.sku} • ${draft.dimensionsRaw}) siparişinizin v${draft.version} taslağı hazırlandı (${Math.round(draft.effectivePpi || 0)} PPI).\n` +
    `Önizleme ve onay bağlantısı: ${approvalUrl}`;

  const log = await ddb.whatsappTestLog.create({
    data: {
      orderId: order.id,
      draftId: draft.id,
      phone: order.phone || "+90 500 000 00 00 (TEST)",
      customer: order.customer,
      message,
      previewUrl,
      approvalUrl,
      mode: "DEMO_SIMULATED",
      status: "simulated_sent",
    },
  });

  // Mevcut DKM Takip'teki "Onay Beklemede" sütununu bul ('Awaiting Approval' veya 'onay_beklemede')
  const cols = (await ddb.statusColumn.findMany()) as { id: string; title: string }[];
  const awaitingCol = cols.find((c) => c.id === "Awaiting Approval" || /onay bekle/i.test(c.title))?.id || "Awaiting Approval";

  await ddb.draftRecord.update({ where: { id: draft.id }, data: { status: "sent" } });
  await ddb.order.update({ where: { id: order.id }, data: { status: awaitingCol, updatedAt: new Date() } });
  await ddb.orderActivity.create({
    data: {
      orderId: order.id,
      author: actor,
      action: "TEST_WHATSAPP_SENT",
      details: `[DEMO] Test WhatsApp kaydı #${log.id} oluşturuldu (gerçek mesaj gönderilmedi). Sipariş 'Onay Beklemede' sütununa taşındı.`,
    },
  });
  return log;
}

export async function generatePrintReadyForDraft(orderId: number, draftId: number, actor: string) {
  const ddb = getDemoDb();
  const order = await ddb.order.findUnique({ where: { id: orderId } });
  const draft = await ddb.draftRecord.findUnique({ where: { id: draftId } });
  if (!order || !draft) throw new EngineError("NOT_APPROVED", "Taslak bulunamadı");
  if (draft.status !== "approved") {
    throw new EngineError("NOT_APPROVED", `Taslak v${draft.version} onaylı değil (mevcut: ${draft.status}). Onaysız baskı dosyası üretilemez!`);
  }
  const latest = await ddb.draftRecord.findFirst({ where: { orderId }, orderBy: { version: "desc" } });
  if (latest && latest.id !== draft.id) {
    throw new EngineError("STALE_VERSION", `Eski taslak sürümü (v${draft.version}) için baskı dosyası üretilemez.`);
  }

  const paths = await getDemoPaths();
  const engSettings = await getDemoEngineSettings();
  if (isDemoMode()) {
    validateOutputPath(paths.approved, paths.designs || DEMO_ROOT, DEMO_ROOT);
    validateOutputPath(paths.printReady, paths.designs || DEMO_ROOT, DEMO_ROOT);
  } else if (paths.designs) {
    const rd = path.resolve(paths.designs);
    for (const outDir of [paths.approved, paths.printReady]) {
      const ro = path.resolve(outDir);
      if (ro === rd || ro.startsWith(rd + path.sep)) {
        throw new EngineError("OUTPUT_PATH_FORBIDDEN", "Güvenlik: Baskı çıktı klasörü salt-okunur tasarım arşivi içinde olamaz.");
      }
    }
  }

  const info = await probeSource(draft.sourcePath, engSettings);
  const work = await ensureWorkImage(info, paths.cache, engSettings);
  const crop: Crop = { x: draft.cropX, y: draft.cropY, w: draft.cropW, h: draft.cropH };
  const dim = { width: draft.width, height: draft.height, unit: draft.unit };
  const isSeamless = draft.layoutMode === "seamless" && !!draft.tileConfig;
  const tile: TileConfig | null = isSeamless ? JSON.parse(draft.tileConfig) : null;
  const ppi = isSeamless && tile ? computeTilePpi(info, dim, tile, engSettings) : computePpi(crop, dim, engSettings);

  const tag = String(order.barcode || order.id).replace(/[^A-Za-z0-9_-]/g, "_");
  const skuSafe = String(draft.sku).replace(/[^A-Za-z0-9_-]/g, "_");
  const approvedFile = path.join(paths.approved, `ORD_${order.id}_${tag}_v${draft.version}_approved.jpg`);
  const approvedJson = path.join(paths.approved, `ORD_${order.id}_${tag}_v${draft.version}_approval.json`);
  const printFile = path.join(paths.printReady, `ORD_${order.id}_${skuSafe}_${draft.width}x${draft.height}${draft.unit}_v${draft.version}${isSeamless ? "_SEAMLESS" : ""}_PRINT.tif`);

  if (draft.previewPath && fs.existsSync(draft.previewPath)) {
    await fs.promises.copyFile(draft.previewPath, approvedFile);
  }
  const printRes =
    isSeamless && tile
      ? await renderTiledPrint(info, work, dim, tile, ppi, printFile, engSettings)
      : await renderPrint(info, work, crop, ppi, printFile, engSettings);
  await fs.promises.writeFile(
    approvedJson,
    JSON.stringify(
      {
        mode: "DEMO_TEST_ONLY",
        orderId: order.id,
        barcode: order.barcode,
        sku: draft.sku,
        version: draft.version,
        approvedAt: draft.approvedAt,
        approvedBy: draft.approvedByName,
        dimensions: draft.dimensionsRaw,
        crop,
        effectivePpi: ppi.effectivePpi,
        printFile: path.basename(printRes.path),
        printWidthPx: printRes.width,
        printHeightPx: printRes.height,
        printPpi: printRes.ppi,
        colorSpace: printRes.colorSpace,
        sha256: printRes.sha256,
        bytes: printRes.bytes,
      },
      null,
      2,
    ),
  );

  const updated = await ddb.draftRecord.update({
    where: { id: draft.id },
    data: {
      approvedPath: approvedFile,
      printReadyPath: printRes.path,
      printReadySha256: printRes.sha256,
      printReadyBytes: printRes.bytes,
    },
  });

  await ddb.orderActivity.create({
    data: {
      orderId: order.id,
      author: actor,
      action: "TEST_PRINT_READY_SAVED",
      details: `Onaylı baskı dosyası TEST klasörüne kaydedildi: ${path.basename(printRes.path)} (${printRes.width}×${printRes.height}px, ${(printRes.bytes / 1024 / 1024).toFixed(2)} MB)`,
    },
  });
  return updated;
}

// === DEMO ORTAMINI SIFIRLA (GERÇEK SERVER DOSYALARINA KESİNLİKLE DOKUNMAZ!) ===
export async function resetDemoOutputsOnly() {
  const ddb = getDemoDb();
  const paths = await getDemoPaths();
  await ddb.whatsappTestLog.deleteMany({});
  await ddb.draftRecord.deleteMany({});
  // YALNIZCA demo çıktı klasörlerini temizle — paths.designs (Windows Server / DESIGNS) KESİNLİKLE SİLİNMEZ!
  for (const dir of [paths.previews, paths.details, paths.approved, paths.printReady, paths.cache]) {
    if (paths.designs && path.resolve(dir) === path.resolve(paths.designs)) continue;
    if (fs.existsSync(dir)) {
      for (const ent of fs.readdirSync(dir)) {
        fs.rmSync(path.join(dir, ent), { recursive: true, force: true });
      }
    }
  }
  return { ok: true, message: "Demo taslakları, test WhatsApp kayıtları ve test çıktı klasörleri temizlendi. Gerçek Server dosyalarına dokunulmadı." };
}

// === SKU ↔ SERVER DOSYASI EŞLEŞTİRME HAFIZASI ===
export async function saveSkuMapping(sku: string, filePath: string, matchedBy = "visual_match") {
  const ddb = getDemoDb();
  const cleanSku = validateSku(sku);
  if (!fs.existsSync(filePath)) throw new EngineError("DESIGN_NOT_FOUND", `Dosya bulunamadı: ${filePath}`);
  return ddb.skuMapping.upsert({
    where: { sku: cleanSku },
    update: { filePath, fileName: path.basename(filePath), matchedBy },
    create: { sku: cleanSku, filePath, fileName: path.basename(filePath), matchedBy },
  });
}

async function loadOrderImageBuffer(item: { image_src?: string | null; url?: string | null }): Promise<Buffer> {
  const raw = (item.image_src || "").split("|")[0]?.trim() || "";
  if (raw.startsWith("data:image")) {
    const comma = raw.indexOf(",");
    if (comma > 0) return Buffer.from(raw.slice(comma + 1), "base64");
  }
  let targetUrl = raw;
  const driveId = extractGoogleDriveId(targetUrl || item.url);
  if (driveId) {
    targetUrl = `https://lh3.googleusercontent.com/d/${driveId}=w600`;
  } else if (targetUrl.startsWith("/uploads/")) {
    targetUrl = `https://printmarkt.co${targetUrl}`;
  } else if (targetUrl.startsWith("uploads/")) {
    targetUrl = `https://printmarkt.co/${targetUrl}`;
  } else if (targetUrl.includes("dropbox.com") && targetUrl.includes("dl=0")) {
    targetUrl = targetUrl.replace("dl=0", "raw=1");
  }
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    throw new EngineError("DESIGN_NOT_FOUND", "Bu siparişte görsel eşleştirme için okunabilir bir ürün görseli bulunamadı.");
  }
  const r = await fetch(targetUrl, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (DKM-Takip-Demo)" } });
  if (!r.ok) throw new EngineError("SOURCE_UNAVAILABLE", `Sipariş görseli indirilemedi (HTTP ${r.status}).`);
  return Buffer.from(await r.arrayBuffer());
}

// === GÖRSELDEN SERVER DOSYASI BULMA (PERCEPTUAL HASH + RENK İMZASI) ===
export async function findVisualMatchesForOrder(orderId: number, limit = 6) {
  const ddb = getDemoDb();
  const order = await ddb.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order || !order.items?.[0]) throw new EngineError("INTERNAL", "Sipariş veya ürün bulunamadı.");

  const indexed = (await ddb.designIndexEntry.findMany({ where: { visualHash: { not: null } } })) as any[];
  if (indexed.length === 0) {
    return {
      ok: false,
      indexedWithHash: 0,
      error: "Görsel eşleştirme için önce Ayarlar > Server Bağlantı Ayarları bölümünden 'Tasarım Klasörlerini İndeksle' butonuna basarak görsel parmak izlerini oluşturun.",
      matches: [],
    };
  }

  const imgBuf = await loadOrderImageBuffer(order.items[0]);
  const orderSig = await computeVisualSignature(imgBuf);

  const scored = indexed
    .map((entry) => ({
      id: entry.id,
      sku: entry.sku,
      fileName: entry.fileName,
      filePath: entry.filePath,
      format: entry.format,
      sizeBytes: entry.sizeBytes,
      widthPx: entry.widthPx,
      heightPx: entry.heightPx,
      colorSpace: entry.colorSpace,
      similarity: compareVisualSignatures(orderSig, entry.visualHash),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return {
    ok: true,
    indexedWithHash: indexed.length,
    matches: scored,
  };
}
