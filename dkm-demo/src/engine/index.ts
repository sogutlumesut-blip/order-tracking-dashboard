// Görsel işleme motoru (Photoshop KULLANMADAN).
// JPG / PNG / TIFF: libvips (sharp) ile doğrudan, akışlı okuma.
// PSD / PSB: kendi PSD çözücümüzle birleşik görüntü satır satır okunur, CACHE'e TIFF olarak yazılır,
//            ardından tüm işlemler libvips ile yapılır.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { EngineError, toEngineError } from "./errors.ts";
import { SourceFile } from "./source-file.ts";
import { readPsdInfo, assertPsdSupported, openRowReader } from "./psd.ts";
import type { PsdInfo } from "./psd.ts";
import { TiffStripWriter } from "./tiff-writer.ts";
import { toInches, formatDim } from "./units.ts";
import type { Dim } from "./units.ts";

sharp.cache(false);

export interface EngineSettings {
  minPpi: number; // altında: YETERSİZ ÇÖZÜNÜRLÜK (otomatik gönderim durdurulur)
  warnPpi: number; // altında: uyarı
  printPpiMax: number; // baskı dosyası en fazla bu PPI ile üretilir (yukarı ölçekleme yapılmaz)
  previewMaxPx: number;
  proxyMaxPx: number;
  detailPx: number;
  maxFileBytes: number;
  maxPixels: number;
  jpegQuality: number;
  failOn: "none" | "truncated" | "error" | "warning";
}

export const DEFAULT_ENGINE: EngineSettings = {
  minPpi: 45,
  warnPpi: 72,
  printPpiMax: 150,
  previewMaxPx: 1600,
  proxyMaxPx: 2400,
  detailPx: 1200,
  maxFileBytes: 12 * 1024 ** 3,
  maxPixels: 3_000_000_000,
  jpegQuality: 86,
  failOn: "warning",
};

export type SourceFormat = "jpeg" | "png" | "tiff" | "psd" | "psb";

export interface SourceInfo {
  path: string;
  format: SourceFormat;
  sizeBytes: number;
  mtimeMs: number;
  width: number;
  height: number;
  channels: number;
  space: string;
  depth: string;
  density: number | null;
  hasAlpha: boolean;
  psd?: PsdInfo;
  warnings: string[];
}

export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

const EXT_FORMATS: Record<string, SourceFormat> = {
  ".jpg": "jpeg",
  ".jpeg": "jpeg",
  ".png": "png",
  ".tif": "tiff",
  ".tiff": "tiff",
  ".psd": "psd",
  ".psb": "psb",
};
export const SUPPORTED_EXTS = Object.keys(EXT_FORMATS);

export async function sniffFormat(p: string): Promise<{ format: SourceFormat | null; detail: string }> {
  const fh = await fs.promises.open(p, "r");
  try {
    const b = Buffer.alloc(16);
    const { bytesRead } = await fh.read(b, 0, 16, 0);
    if (bytesRead < 4) return { format: null, detail: "dosya boş veya çok kısa" };
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { format: "jpeg", detail: "JPEG" };
    if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { format: "png", detail: "PNG" };
    const s4 = b.toString("latin1", 0, 4);
    if (s4 === "II*\0" || s4 === "MM\0*" || s4 === "II+\0" || s4 === "MM\0+") return { format: "tiff", detail: "TIFF" };
    if (s4 === "8BPS") {
      const v = b.readUInt16BE(4);
      return { format: v === 2 ? "psb" : "psd", detail: v === 2 ? "PSB" : "PSD" };
    }
    if (s4 === "%PDF") return { format: null, detail: "PDF/AI (vektörel) – desteklenmiyor" };
    if (s4.startsWith("%!PS") || (b[0] === 0xc5 && b[1] === 0xd0)) return { format: null, detail: "EPS – desteklenmiyor" };
    return { format: null, detail: "tanınmayan dosya içeriği" };
  } finally {
    await fh.close();
  }
}

function sharpOpts(s: EngineSettings, extra: any = {}) {
  return { limitInputPixels: false as const, failOn: s.failOn, ...extra };
}

export async function probeSource(p: string, s: EngineSettings = DEFAULT_ENGINE): Promise<SourceInfo> {
  let st: fs.Stats;
  try {
    st = await fs.promises.stat(p);
  } catch (e: any) {
    if (e.code === "ENOENT") throw new EngineError("DESIGN_NOT_FOUND", `Tasarım dosyası yok: ${p}`);
    throw toEngineError(e);
  }
  if (!st.isFile()) throw new EngineError("DESIGN_NOT_FOUND", `Dosya değil: ${p}`);
  if (st.size === 0) throw new EngineError("CORRUPT_FILE", "Dosya boş (0 bayt)");
  if (st.size > s.maxFileBytes) {
    throw new EngineError(
      "FILE_TOO_LARGE",
      `Dosya ${(st.size / 1024 ** 3).toFixed(2)} GB; sınır ${(s.maxFileBytes / 1024 ** 3).toFixed(2)} GB (Yönetim panelinden değiştirilebilir)`,
    );
  }
  const sn = await sniffFormat(p);
  const warnings: string[] = [];
  if (!sn.format) throw new EngineError("UNSUPPORTED_FORMAT", `${ERRMSG_UNSUPPORTED}: ${sn.detail}`);
  const extFmt = EXT_FORMATS[path.extname(p).toLowerCase()];
  if (extFmt && extFmt !== sn.format && !(extFmt === "psd" && sn.format === "psb") && !(extFmt === "psb" && sn.format === "psd")) {
    warnings.push(`Dosya uzantısı (${path.extname(p)}) içerikle uyuşmuyor; içerik ${sn.detail} olarak okundu`);
  }

  if (sn.format === "psd" || sn.format === "psb") {
    const src = await new SourceFile(p).open();
    try {
      const info = await readPsdInfo(src);
      assertPsdSupported(info);
      // görüntü verisinin bütünlüğünü kontrol eder (satır tablosu / kesik dosya)
      const rr = await openRowReader(src, info, 0);
      void rr;
      if (info.width * info.height > s.maxPixels) throw new EngineError("FILE_TOO_LARGE", `Piksel sayısı sınırı aşıldı (${info.width}x${info.height})`);
      return {
        path: p,
        format: sn.format,
        sizeBytes: st.size,
        mtimeMs: st.mtimeMs,
        width: info.width,
        height: info.height,
        channels: info.channels,
        space: info.colorModeName,
        depth: `${info.depth}-bit`,
        density: info.resolution ? info.resolution.x : null,
        hasAlpha: info.channels > info.outChannels,
        psd: info,
        warnings: info.hasRealMergedData === null ? [...warnings, "PSD sürüm bilgisi kaynağı yok; birleşik görüntü kullanıldı"] : warnings,
      };
    } finally {
      await src.close();
    }
  }

  try {
    const m = await sharp(p, sharpOpts(s)).metadata();
    if (!m.width || !m.height) throw new EngineError("CORRUPT_FILE", "Görüntü boyutu okunamadı");
    if (m.width * m.height > s.maxPixels) throw new EngineError("FILE_TOO_LARGE", `Piksel sayısı sınırı aşıldı (${m.width}x${m.height})`);
    if ((m.pages || 1) > 1 && sn.format === "tiff") warnings.push(`TIFF ${m.pages} sayfa içeriyor; yalnızca ilk sayfa kullanılır`);
    return {
      path: p,
      format: sn.format,
      sizeBytes: st.size,
      mtimeMs: st.mtimeMs,
      width: m.width,
      height: m.height,
      channels: m.channels || 0,
      space: m.space || "?",
      depth: m.depth || "?",
      density: m.density || null,
      hasAlpha: !!m.hasAlpha,
      warnings,
    };
  } catch (e) {
    throw toEngineError(e);
  }
}
const ERRMSG_UNSUPPORTED = "Desteklenmeyen dosya biçimi";

export function cacheKey(info: SourceInfo) {
  return crypto.createHash("sha1").update(`${path.resolve(info.path)}|${info.sizeBytes}|${Math.round(info.mtimeMs)}`).digest("hex").slice(0, 20);
}

// Dosyayı tamamen okuyarak (tüm satırlar) doğrular: kesik / bozuk veride sahte başarı olmaz.
export interface WorkImage {
  workPath: string;
  cacheHit: boolean;
  ms: number;
  bytesRead: number;
}

export async function ensureWorkImage(info: SourceInfo, cacheDir: string, s: EngineSettings = DEFAULT_ENGINE, hooks: { onStage?: (n: string) => Promise<void> | void } = {}): Promise<WorkImage> {
  const t0 = Date.now();
  if (info.format !== "psd" && info.format !== "psb") {
    return { workPath: info.path, cacheHit: true, ms: 0, bytesRead: 0 };
  }
  const dir = path.join(cacheDir, "work");
  await fs.promises.mkdir(dir, { recursive: true });
  const out = path.join(dir, `${cacheKey(info)}.tif`);
  if (fs.existsSync(out)) {
    const now = new Date();
    await fs.promises.utimes(out, now, now).catch(() => {}); // LRU için
    return { workPath: out, cacheHit: true, ms: Date.now() - t0, bytesRead: 0 };
  }
  const psd = info.psd!;
  const tmp = `${out}.${process.pid}.${Date.now()}.tmp`;
  const src = await new SourceFile(info.path).open();
  let w: TiffStripWriter | null = null;
  try {
    await hooks.onStage?.("psd_decode");
    const rr = await openRowReader(src, psd, 0);
    const ppi = psd.resolution?.x || 72;
    const rawEstimate = psd.width * psd.height * psd.outChannels;
    w = new TiffStripWriter(tmp, {
      width: psd.width,
      height: psd.height,
      samples: psd.outChannels as 1 | 3 | 4,
      photometric: psd.colorMode === 4 ? 5 : psd.colorMode === 1 ? 1 : 2,
      xRes: ppi,
      yRes: psd.resolution?.y || ppi,
      icc: psd.icc,
      bigtiff: rawEstimate > 3.5 * 1024 ** 3,
      compression: "deflate",
      level: 1,
    });
    for (let r = 0; r < psd.height; r++) {
      const row = await rr.nextRow();
      await w.writeRow(row);
    }
    await w.close();
    await fs.promises.rename(tmp, out);
    return { workPath: out, cacheHit: false, ms: Date.now() - t0, bytesRead: src.bytesRead };
  } catch (e) {
    w?.abort();
    await fs.promises.rm(tmp, { force: true });
    throw toEngineError(e);
  } finally {
    await src.close();
  }
}

export interface Proxy {
  proxyPath: string;
  width: number;
  height: number;
  scale: number; // proxy px / kaynak px
  cacheHit: boolean;
}

export async function ensureProxy(info: SourceInfo, work: WorkImage, cacheDir: string, s: EngineSettings = DEFAULT_ENGINE): Promise<Proxy> {
  const dir = path.join(cacheDir, "proxy");
  await fs.promises.mkdir(dir, { recursive: true });
  const out = path.join(dir, `${cacheKey(info)}_${s.proxyMaxPx}.jpg`);
  const scale = Math.min(1, s.proxyMaxPx / Math.max(info.width, info.height));
  const pw = Math.max(1, Math.round(info.width * scale));
  const ph = Math.max(1, Math.round(info.height * scale));
  if (fs.existsSync(out)) {
    const m = await sharp(out).metadata();
    return { proxyPath: out, width: m.width!, height: m.height!, scale: m.width! / info.width, cacheHit: true };
  }
  const tmp = `${out}.${process.pid}.tmp`;
  try {
    // Tüm görüntü sıralı okunur → kesik/bozuk dosyalar burada hata verir.
    await sharp(work.workPath, sharpOpts(s, { sequentialRead: true }))
      .resize(pw, ph, { fit: "fill", kernel: "lanczos3" })
      .flatten({ background: "#ffffff" })
      .toColourspace("srgb")
      .jpeg({ quality: 85, mozjpeg: false })
      .toFile(tmp);
    await fs.promises.rename(tmp, out);
  } catch (e) {
    await fs.promises.rm(tmp, { force: true });
    throw toEngineError(e);
  }
  const m = await sharp(out).metadata();
  return { proxyPath: out, width: m.width!, height: m.height!, scale: m.width! / info.width, cacheHit: false };
}

export function defaultCrop(srcW: number, srcH: number, targetAspect: number): Crop {
  // "cover": hedef oranında, merkezlenmiş en büyük alan
  let w = srcW;
  let h = w / targetAspect;
  if (h > srcH) {
    h = srcH;
    w = h * targetAspect;
  }
  w = Math.max(1, Math.floor(w));
  h = Math.max(1, Math.floor(h));
  return { x: Math.floor((srcW - w) / 2), y: Math.floor((srcH - h) / 2), w, h };
}

export function validateCrop(c: Crop, srcW: number, srcH: number, targetAspect: number): Crop {
  const r = { x: Math.round(Number(c.x)), y: Math.round(Number(c.y)), w: Math.round(Number(c.w)), h: Math.round(Number(c.h)) };
  if (![r.x, r.y, r.w, r.h].every(Number.isFinite)) throw new EngineError("INVALID_CROP", "Kırpma değerleri sayı değil");
  if (r.w < 16 || r.h < 16) throw new EngineError("INVALID_CROP", "Kırpma alanı çok küçük");
  if (r.x < 0 || r.y < 0 || r.x + r.w > srcW || r.y + r.h > srcH) throw new EngineError("INVALID_CROP", `Kırpma alanı görüntü dışında (${srcW}x${srcH})`);
  const aspect = r.w / r.h;
  if (Math.abs(aspect - targetAspect) / targetAspect > 0.02) throw new EngineError("INVALID_CROP", `Kırpma oranı sipariş oranıyla uyuşmuyor (${aspect.toFixed(3)} ≠ ${targetAspect.toFixed(3)})`);
  return r;
}

export interface PpiResult {
  effectivePpi: number;
  outPpi: number;
  outW: number;
  outH: number;
  status: "ok" | "warn" | "low";
}

export function computePpi(crop: Crop, dim: Dim, s: EngineSettings = DEFAULT_ENGINE): PpiResult {
  const inch = toInches(dim);
  const ppiX = crop.w / inch.w;
  const ppiY = crop.h / inch.h;
  const effectivePpi = Math.min(ppiX, ppiY);
  const outPpi = Math.min(effectivePpi, s.printPpiMax);
  const outW = Math.max(1, Math.round(inch.w * outPpi));
  const outH = Math.max(1, Math.round(inch.h * outPpi));
  const status = effectivePpi < s.minPpi ? "low" : effectivePpi < s.warnPpi ? "warn" : "ok";
  return { effectivePpi, outPpi, outW, outH, status };
}

function esc(t: string) {
  return t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

async function atomicJpeg(pipeline: sharp.Sharp, out: string, q: number) {
  await fs.promises.mkdir(path.dirname(out), { recursive: true });
  const tmp = `${out}.${process.pid}.tmp`;
  try {
    await pipeline.jpeg({ quality: q, chromaSubsampling: "4:4:4" }).toFile(tmp);
    await fs.promises.rename(tmp, out);
  } catch (e) {
    await fs.promises.rm(tmp, { force: true });
    throw toEngineError(e);
  }
}

export interface PreviewMeta {
  orderNo: string;
  sku: string;
  version: number;
  dim: Dim;
}

export async function renderPreview(info: SourceInfo, work: WorkImage, proxy: Proxy, crop: Crop, ppi: PpiResult, meta: PreviewMeta, out: string, s: EngineSettings = DEFAULT_ENGINE) {
  const aspect = crop.w / crop.h;
  let pw = aspect >= 1 ? s.previewMaxPx : Math.round(s.previewMaxPx * aspect);
  let ph = aspect >= 1 ? Math.round(s.previewMaxPx / aspect) : s.previewMaxPx;
  pw = Math.max(1, Math.min(pw, Math.round(crop.w)));
  ph = Math.max(1, Math.min(ph, Math.round(crop.h)));
  if (pw < 2 || ph < 2) throw new EngineError("INVALID_CROP", "Önizleme için alan çok küçük");
  // proxy yeterli çözünürlükteyse onu kullan, değilse tam çözünürlüklü görüntüden üret
  const cropInProxyW = crop.w * proxy.scale;
  let base: sharp.Sharp;
  if (cropInProxyW >= pw) {
    const pc = {
      left: Math.max(0, Math.min(proxy.width - 1, Math.round(crop.x * proxy.scale))),
      top: Math.max(0, Math.min(proxy.height - 1, Math.round(crop.y * proxy.scale))),
      width: 0,
      height: 0,
    };
    pc.width = Math.max(1, Math.min(proxy.width - pc.left, Math.round(crop.w * proxy.scale)));
    pc.height = Math.max(1, Math.min(proxy.height - pc.top, Math.round(crop.h * proxy.scale)));
    base = sharp(proxy.proxyPath).extract(pc).resize(pw, ph, { fit: "fill" });
  } else {
    base = sharp(work.workPath, sharpOpts(s)).extract({ left: crop.x, top: crop.y, width: crop.w, height: crop.h }).resize(pw, ph, { fit: "fill" }).flatten({ background: "#ffffff" });
  }
  const img = await base.toColourspace("srgb").removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = img.info.width;
  const H = img.info.height;
  const barH = Math.max(34, Math.round(Math.max(W, H) * 0.035));
  const fs1 = Math.round(barH * 0.42);
  const ppiTxt = `${Math.round(ppi.effectivePpi)} PPI${ppi.status === "low" ? " – YETERSİZ" : ppi.status === "warn" ? " – düşük" : ""}`;
  const label = `#${meta.orderNo} • ${meta.sku} • ${formatDim(meta.dim)} • Taslak v${meta.version} • ${ppiTxt}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + barH}">
    <rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="#0f172a" stroke-width="2"/>
    <rect x="0" y="${H}" width="${W}" height="${barH}" fill="#0f172a"/>
    <text x="12" y="${H + barH / 2 + fs1 / 3}" font-family="Helvetica, Arial, sans-serif" font-size="${fs1}" fill="#ffffff">${esc(label)}</text>
  </svg>`;
  const pipeline = sharp(img.data, { raw: { width: W, height: H, channels: 3 } })
    .extend({ bottom: barH, background: "#0f172a" })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }]);
  await atomicJpeg(pipeline, out, s.jpegQuality);
  return { width: W, height: H + barH };
}

export async function renderDetail(info: SourceInfo, work: WorkImage, crop: Crop, ppi: PpiResult, out: string, s: EngineSettings = DEFAULT_ENGINE, center?: { cx: number; cy: number }) {
  // Baskı dosyasındaki pikseller 1:1 (%100) gösterilir.
  const scale = ppi.outPpi / ppi.effectivePpi; // ≤ 1
  const dw = Math.min(s.detailPx, ppi.outW);
  const dh = Math.min(Math.round(s.detailPx * 0.66), ppi.outH);
  const sw = Math.min(crop.w, Math.max(1, Math.round(dw / scale)));
  const sh = Math.min(crop.h, Math.max(1, Math.round(dh / scale)));
  const cx = center ? center.cx : crop.x + crop.w / 2;
  const cy = center ? center.cy : crop.y + crop.h / 2;
  const left = Math.round(Math.max(crop.x, Math.min(crop.x + crop.w - sw, cx - sw / 2)));
  const top = Math.round(Math.max(crop.y, Math.min(crop.y + crop.h - sh, cy - sh / 2)));
  let p = sharp(work.workPath, sharpOpts(s)).extract({ left, top, width: sw, height: sh });
  if (scale < 0.9999) p = p.resize(Math.max(1, Math.round(sw * scale)), Math.max(1, Math.round(sh * scale)), { fit: "fill", kernel: "lanczos3" });
  const img = await p.flatten({ background: "#ffffff" }).toColourspace("srgb").removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = img.info.width;
  const H = img.info.height;
  const barH = 30;
  const txt = `%100 DETAY • baskı dosyasındaki gerçek pikseller • ${ppi.outPpi.toFixed(1)} PPI baskı / ${ppi.effectivePpi.toFixed(1)} efektif PPI • ${W}x${H}px ≈ ${((W / ppi.outPpi) * 2.54).toFixed(1)}×${((H / ppi.outPpi) * 2.54).toFixed(1)} cm`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${barH}"><rect width="${W}" height="${barH}" fill="#1e293b"/><text x="8" y="20" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#fbbf24">${esc(txt)}</text></svg>`;
  const pipeline = sharp(img.data, { raw: { width: W, height: H, channels: 3 } })
    .extend({ bottom: barH, background: "#1e293b" })
    .composite([{ input: Buffer.from(svg), top: H, left: 0 }]);
  await atomicJpeg(pipeline, out, 92);
  return { width: W, height: H, region: { left, top, width: sw, height: sh } };
}

export async function renderPrint(info: SourceInfo, work: WorkImage, crop: Crop, ppi: PpiResult, out: string, s: EngineSettings = DEFAULT_ENGINE) {
  await fs.promises.mkdir(path.dirname(out), { recursive: true });
  const tmp = `${out}.${process.pid}.tmp`;
  const isCmyk = /cmyk/i.test(info.space);
  const rawBytes = ppi.outW * ppi.outH * (isCmyk ? 4 : 3);
  try {
    let p = sharp(work.workPath, sharpOpts(s)).extract({ left: crop.x, top: crop.y, width: crop.w, height: crop.h });
    if (ppi.outW !== crop.w || ppi.outH !== crop.h) p = p.resize(ppi.outW, ppi.outH, { fit: "fill", kernel: "lanczos3" });
    p = p.flatten({ background: "#ffffff" });
    if (isCmyk) p = p.toColourspace("cmyk");
    else p = p.toColourspace("srgb");
    p = p.keepIccProfile();
    await p
      .tiff({ compression: "lzw", xres: ppi.outPpi / 25.4, yres: ppi.outPpi / 25.4, resolutionUnit: "inch", bigtiff: rawBytes > 3.8 * 1024 ** 3 })
      .toFile(tmp);
    await fs.promises.rename(tmp, out);
  } catch (e) {
    await fs.promises.rm(tmp, { force: true });
    throw toEngineError(e);
  }
  const hash = crypto.createHash("sha256");
  await new Promise<void>((res, rej) => fs.createReadStream(out).on("data", (d) => hash.update(d)).on("end", () => res()).on("error", rej));
  const st = await fs.promises.stat(out);
  return { path: out, sha256: hash.digest("hex"), bytes: st.size, width: ppi.outW, height: ppi.outH, ppi: ppi.outPpi, colorSpace: isCmyk ? "CMYK" : "sRGB" };
}

export async function sha256File(p: string) {
  const hash = crypto.createHash("sha256");
  await new Promise<void>((res, rej) => fs.createReadStream(p).on("data", (d) => hash.update(d)).on("end", () => res()).on("error", rej));
  return hash.digest("hex");
}

// === SEAMLESS / TAKİPLİ DESEN (TEKRARLAMALI DÖŞEME) MOTORU ===

export interface TileConfig {
  repeatWidthInch: number; // 1 desen tekrarının fiziksel genişliği (inç)
  offsetX?: number; // 0..1 yatay kaydırma oranı
  offsetY?: number; // 0..1 dikey kaydırma oranı
  halfDrop?: boolean; // Yarım kaydırmalı (half-drop) takip
}

export function computeTilePpi(info: SourceInfo, dim: Dim, tile: TileConfig, s: EngineSettings = DEFAULT_ENGINE): PpiResult {
  const inch = toInches(dim);
  const repeatW = Math.max(0.5, Number(tile.repeatWidthInch || inch.w));
  const effectivePpi = info.width / repeatW;
  const outPpi = Math.min(effectivePpi, s.printPpiMax);
  const outW = Math.max(1, Math.round(inch.w * outPpi));
  const outH = Math.max(1, Math.round(inch.h * outPpi));
  const status = effectivePpi < s.minPpi ? "low" : effectivePpi < s.warnPpi ? "warn" : "ok";
  return { effectivePpi, outPpi, outW, outH, status };
}

// Verilen kaynak görseli (targetW x targetH) tuvaline (tileW x tileH) olarak kesintisiz döşer.
// Kenar taşmalarını hassas şekilde kırparak sharp.composite sınır hatalarını önler.
async function buildTiledRawBuffer(
  sourcePath: string,
  targetW: number,
  targetH: number,
  tileW: number,
  tileH: number,
  opts: { offsetX?: number; offsetY?: number; halfDrop?: boolean; cmyk?: boolean; s: EngineSettings },
): Promise<{ data: Buffer; channels: 3 | 4 }> {
  const tw = Math.max(8, Math.round(tileW));
  const th = Math.max(8, Math.round(tileH));
  const channels: 3 | 4 = opts.cmyk ? 4 : 3;

  let tilePipe = sharp(sourcePath, sharpOpts(opts.s)).resize(tw, th, { fit: "fill", kernel: "lanczos3" }).flatten({ background: "#ffffff" });
  tilePipe = opts.cmyk ? tilePipe.toColourspace("cmyk") : tilePipe.toColourspace("srgb").removeAlpha();
  const tileRaw = await tilePipe.raw().toBuffer();

  // Bellek içi doğrudan piksel döşemesi (çok hızlı ve sınır taşması sıfır!)
  const out = Buffer.allocUnsafe(targetW * targetH * channels);
  const offX = ((((opts.offsetX || 0) % 1) + 1) % 1) * tw;
  const offY = ((((opts.offsetY || 0) % 1) + 1) % 1) * th;
  const halfDrop = !!opts.halfDrop;
  const tileRowBytes = tw * channels;
  const outRowBytes = targetW * channels;

  for (let y = 0; y < targetH; y++) {
    const outRowBase = y * outRowBytes;
    if (!halfDrop) {
      const sy = Math.floor(y + offY) % th;
      const srcRowBase = sy * tileRowBytes;
      // Yatayda satır parçalarını doğrudan kopyala (memcpy hızında)
      let x = 0;
      let sx = Math.floor(offX) % tw;
      while (x < targetW) {
        const copyPx = Math.min(targetW - x, tw - sx);
        tileRaw.copy(out, outRowBase + x * channels, srcRowBase + sx * channels, srcRowBase + (sx + copyPx) * channels);
        x += copyPx;
        sx = 0;
      }
    } else {
      // Half-drop: tek sayılı sütunlarda dikeyde yarım tile (th / 2) kaydır
      let x = 0;
      const startColX = Math.floor(offX);
      while (x < targetW) {
        const gx = x + startColX;
        const colIdx = Math.floor(gx / tw);
        const sx = gx - colIdx * tw;
        const drop = (colIdx & 1) ? Math.floor(th / 2) : 0;
        const sy = (Math.floor(y + offY) + drop) % th;
        const copyPx = Math.min(targetW - x, tw - sx);
        const srcRowBase = sy * tileRowBytes;
        tileRaw.copy(out, outRowBase + x * channels, srcRowBase + sx * channels, srcRowBase + (sx + copyPx) * channels);
        x += copyPx;
      }
    }
  }

  return { data: out, channels };
}

function dimSideLabel(val: number, unit: Dim["unit"], axis: "W" | "H") {
  const f = (Math.round(val * 100) / 100).toString();
  if (unit === "in") return `${f}"${axis}`;
  return `${f} ${unit} ${axis}`;
}

export async function renderTiledPreview(
  info: SourceInfo,
  work: WorkImage,
  proxy: Proxy,
  dim: Dim,
  tile: TileConfig,
  ppi: PpiResult,
  meta: PreviewMeta,
  out: string,
  s: EngineSettings = DEFAULT_ENGINE,
) {
  const inch = toInches(dim);
  const aspect = inch.w / inch.h;
  let pw = aspect >= 1 ? s.previewMaxPx : Math.round(s.previewMaxPx * aspect);
  let ph = aspect >= 1 ? Math.round(s.previewMaxPx / aspect) : s.previewMaxPx;
  pw = Math.max(120, pw);
  ph = Math.max(120, ph);

  const pxPerInch = pw / inch.w;
  const tileWpx = Math.max(16, Math.round(tile.repeatWidthInch * pxPerInch));
  const tileHpx = Math.max(16, Math.round(tileWpx * (info.height / info.width)));
  const srcForPreview = tileWpx <= proxy.width ? proxy.proxyPath : work.workPath;

  const tiled = await buildTiledRawBuffer(srcForPreview, pw, ph, tileWpx, tileHpx, {
    offsetX: tile.offsetX,
    offsetY: tile.offsetY,
    halfDrop: tile.halfDrop,
    cmyk: false,
    s,
  });

  // Ölçü çerçevesi (üstte genişlik 39"W, solda yükseklik 75"H, altta bilgi çubuğu)
  const padTop = 44;
  const padLeft = 44;
  const padRight = 24;
  const barH = 38;
  const fullW = padLeft + pw + padRight;
  const fullH = padTop + ph + barH;
  const wLabel = dimSideLabel(dim.width, dim.unit, "W");
  const hLabel = dimSideLabel(dim.height, dim.unit, "H");
  const repeatsX = (inch.w / tile.repeatWidthInch).toFixed(2);
  const ppiTxt = `${Math.round(ppi.effectivePpi)} PPI${ppi.status === "low" ? " – YETERSİZ" : ppi.status === "warn" ? " – düşük" : ""}`;
  const barLabel = `#${meta.orderNo} • ${meta.sku} • ${formatDim(meta.dim)} • TAKİPLİ (Seamless ${repeatsX}x) • v${meta.version} • ${ppiTxt}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${fullW}" height="${fullH}">
    <line x1="0" y1="${padTop}" x2="${fullW}" y2="${padTop}" stroke="#dc2626" stroke-width="1"/>
    <line x1="0" y1="${padTop + ph}" x2="${fullW}" y2="${padTop + ph}" stroke="#dc2626" stroke-width="1"/>
    <line x1="${padLeft}" y1="0" x2="${padLeft}" y2="${padTop + ph}" stroke="#dc2626" stroke-width="1"/>
    <line x1="${padLeft + pw}" y1="0" x2="${padLeft + pw}" y2="${padTop + ph}" stroke="#dc2626" stroke-width="1"/>
    <text x="${padLeft + pw / 2}" y="${padTop - 13}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="22" fill="#f8fafc">${esc(wLabel)}</text>
    <text x="${padLeft - 14}" y="${padTop + ph / 2}" text-anchor="middle" transform="rotate(-90 ${padLeft - 14} ${padTop + ph / 2})" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="22" fill="#f8fafc">${esc(hLabel)}</text>
    <rect x="0" y="${padTop + ph}" width="${fullW}" height="${barH}" fill="#0f172a"/>
    <text x="14" y="${padTop + ph + 24}" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#ffffff">${esc(barLabel)}</text>
  </svg>`;

  const pipeline = sharp(tiled.data, { raw: { width: pw, height: ph, channels: 3 } })
    .extend({ top: padTop, left: padLeft, right: padRight, bottom: barH, background: "#18181b" })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }]);

  await atomicJpeg(pipeline, out, s.jpegQuality);
  return { width: fullW, height: fullH };
}

export async function renderTiledDetail(
  info: SourceInfo,
  work: WorkImage,
  dim: Dim,
  tile: TileConfig,
  ppi: PpiResult,
  out: string,
  s: EngineSettings = DEFAULT_ENGINE,
) {
  const dw = Math.min(s.detailPx, ppi.outW);
  const dh = Math.min(Math.round(s.detailPx * 0.66), ppi.outH);
  const tileWpx = Math.max(16, Math.round(tile.repeatWidthInch * ppi.outPpi));
  const tileHpx = Math.max(16, Math.round(tileWpx * (info.height / info.width)));

  const tiled = await buildTiledRawBuffer(work.workPath, dw, dh, tileWpx, tileHpx, {
    offsetX: tile.offsetX,
    offsetY: tile.offsetY,
    halfDrop: tile.halfDrop,
    cmyk: false,
    s,
  });

  const barH = 30;
  const txt = `%100 TAKİPLİ DETAY • ${ppi.outPpi.toFixed(1)} PPI baskı / ${ppi.effectivePpi.toFixed(1)} efektif PPI • ${dw}×${dh}px ≈ ${((dw / ppi.outPpi) * 2.54).toFixed(1)}×${((dh / ppi.outPpi) * 2.54).toFixed(1)} cm`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${dw}" height="${barH}"><rect width="${dw}" height="${barH}" fill="#1e293b"/><text x="8" y="20" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#fbbf24">${esc(txt)}</text></svg>`;
  const pipeline = sharp(tiled.data, { raw: { width: dw, height: dh, channels: 3 } })
    .extend({ bottom: barH, background: "#1e293b" })
    .composite([{ input: Buffer.from(svg), top: dh, left: 0 }]);
  await atomicJpeg(pipeline, out, 92);
  return { width: dw, height: dh };
}

export async function renderTiledPrint(
  info: SourceInfo,
  work: WorkImage,
  dim: Dim,
  tile: TileConfig,
  ppi: PpiResult,
  out: string,
  s: EngineSettings = DEFAULT_ENGINE,
) {
  await fs.promises.mkdir(path.dirname(out), { recursive: true });
  const tmp = `${out}.${process.pid}.tmp`;
  const isCmyk = /cmyk/i.test(info.space);
  const tileWpx = Math.max(16, Math.round(tile.repeatWidthInch * ppi.outPpi));
  const tileHpx = Math.max(16, Math.round(tileWpx * (info.height / info.width)));
  const rawBytes = ppi.outW * ppi.outH * (isCmyk ? 4 : 3);

  try {
    const tiled = await buildTiledRawBuffer(work.workPath, ppi.outW, ppi.outH, tileWpx, tileHpx, {
      offsetX: tile.offsetX,
      offsetY: tile.offsetY,
      halfDrop: tile.halfDrop,
      cmyk: isCmyk,
      s,
    });
    let pipe = sharp(tiled.data, { raw: { width: ppi.outW, height: ppi.outH, channels: tiled.channels } });
    if (isCmyk) pipe = pipe.toColourspace("cmyk");
    else pipe = pipe.toColourspace("srgb");
    await pipe
      .tiff({ compression: "lzw", xres: ppi.outPpi / 25.4, yres: ppi.outPpi / 25.4, resolutionUnit: "inch", bigtiff: rawBytes > 3.8 * 1024 ** 3 })
      .toFile(tmp);
    await fs.promises.rename(tmp, out);
  } catch (e) {
    await fs.promises.rm(tmp, { force: true });
    throw toEngineError(e);
  }
  const hash = await sha256File(out);
  const st = await fs.promises.stat(out);
  return { path: out, sha256: hash, bytes: st.size, width: ppi.outW, height: ppi.outH, ppi: ppi.outPpi, colorSpace: isCmyk ? "CMYK" : "sRGB" };
}
