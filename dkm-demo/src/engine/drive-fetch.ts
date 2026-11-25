// Google Drive / Özel Tasarım Bağlantısı İndirici (Salt Okunur / Önbellekli)
// - drive.google.com/file/d/<ID>/view, open?id=<ID>, uc?id=<ID> bağlantılarını destekler.
// - Büyük dosyalarda Google Drive virüs tarama onayını aşmak için drive.usercontent.google.com kullanır.
// - HTML giriş/yetki sayfası dönerse sahte başarı vermez, açık hata (SOURCE_UNAVAILABLE) fırlatır.
// - İndirilen dosya DKM_DEMO/CACHE/drive/ içine kaydedilir ve gerçek format/piksel/PPI kontrolünden geçer.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EngineError } from "./errors.ts";
import { sniffFormat } from "./index.ts";

export function extractGoogleDriveId(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const s = rawUrl.trim();
  const m1 = s.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m1) return m1[1];
  const m2 = s.match(/drive\.google\.com\/(?:open|uc)\?[^#]*\bid=([a-zA-Z0-9_-]{10,})/);
  if (m2) return m2[1];
  const m3 = s.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m3) return m3[1];
  return null;
}

export function findCustomDesignUrl(item: { url?: string | null; image_src?: string | null } | null | undefined): string | null {
  if (!item) return null;
  const candidates = [item.url, ...(item.image_src ? item.image_src.split("|") : [])].filter(Boolean) as string[];
  for (const c of candidates) {
    const trimmed = c.trim();
    if (extractGoogleDriveId(trimmed)) return trimmed;
    if (/dropbox\.com/i.test(trimmed)) return trimmed;
  }
  return null;
}

function extFromFormat(fmt: string | null): string {
  if (fmt === "jpeg") return ".jpg";
  if (fmt === "png") return ".png";
  if (fmt === "tiff") return ".tif";
  if (fmt === "psd") return ".psd";
  if (fmt === "psb") return ".psb";
  return ".bin";
}

export async function fetchCustomDesignToCache(rawUrl: string, cacheDir: string): Promise<{ filePath: string; cacheHit: boolean; sourceLabel: string }> {
  const driveDir = path.join(cacheDir, "drive");
  await fs.promises.mkdir(driveDir, { recursive: true });

  const driveId = extractGoogleDriveId(rawUrl);
  const key = driveId ? `gdrive_${driveId}` : `url_${crypto.createHash("sha1").update(rawUrl).digest("hex").slice(0, 20)}`;

  // Önbellekte zaten geçerli dosya varsa doğrudan kullan
  for (const ext of [".tif", ".psd", ".psb", ".jpg", ".png"]) {
    const existing = path.join(driveDir, `${key}${ext}`);
    if (fs.existsSync(existing) && fs.statSync(existing).size > 100) {
      return { filePath: existing, cacheHit: true, sourceLabel: driveId ? `Google Drive (${driveId})` : rawUrl };
    }
  }

  let downloadUrl = rawUrl.trim();
  if (driveId) {
    downloadUrl = `https://drive.usercontent.google.com/download?id=${driveId}&export=download&confirm=t`;
  } else if (/dropbox\.com/i.test(downloadUrl) && downloadUrl.includes("dl=0")) {
    downloadUrl = downloadUrl.replace("dl=0", "dl=1");
  }

  let res: Response;
  try {
    res = await fetch(downloadUrl, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (DKM-Takip-Demo)" },
    });
  } catch (e: any) {
    throw new EngineError("SOURCE_UNAVAILABLE", `Google Drive / harici tasarım indirilemedi: ${e?.message || e}`);
  }

  if (!res.ok) {
    throw new EngineError("SOURCE_UNAVAILABLE", `Google Drive / harici bağlantı HTTP ${res.status} döndü (dosya erişime kapalı veya silinmiş olabilir).`);
  }

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("text/html")) {
    throw new EngineError(
      "SOURCE_UNAVAILABLE",
      "Google Drive dosyası indirilemedi (HTML giriş/izin sayfası döndü). Dosyanın 'Bağlantıya sahip olan herkes görüntüleyebilir' iznine açık olduğundan emin olun.",
    );
  }

  const tmp = path.join(driveDir, `${key}.${process.pid}.${Date.now()}.tmp`);
  try {
    const arrBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrBuf);
    if (buf.length < 32) {
      throw new EngineError("CORRUPT_FILE", "İndirilen Google Drive dosyası boş veya çok küçük.");
    }
    // Bazı Drive yanıtlarında Content-Type octet-stream olsa da gövde HTML olabilir
    const headStr = buf.subarray(0, 64).toString("latin1").trim().toLowerCase();
    if (headStr.startsWith("<!doctype html") || headStr.startsWith("<html")) {
      throw new EngineError(
        "SOURCE_UNAVAILABLE",
        "Google Drive erişim izni gerekli (dosya yerine HTML sayfası döndü). Paylaşım iznini açın.",
      );
    }

    await fs.promises.writeFile(tmp, buf);
    const sn = await sniffFormat(tmp);
    if (!sn.format) {
      await fs.promises.rm(tmp, { force: true });
      throw new EngineError(
        "UNSUPPORTED_FORMAT",
        `Google Drive'dan indirilen dosya desteklenmeyen biçimde (${sn.detail}). Desteklenen: TIFF, PSD, PSB, JPG, PNG.`,
      );
    }

    const finalPath = path.join(driveDir, `${key}${extFromFormat(sn.format)}`);
    await fs.promises.rename(tmp, finalPath);
    return { filePath: finalPath, cacheHit: false, sourceLabel: driveId ? `Google Drive (${driveId})` : rawUrl };
  } catch (e) {
    await fs.promises.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
}
