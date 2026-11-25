// Google Drive Dosya + Klasör İndirici (Salt Okunur / Önbellekli)
// - Hem tek dosya (/file/d/<ID>) hem klasör (/drive/folders/<ID>) linklerini destekler.
// - Şirket Google OAuth accessToken varsa özel/paylaşılan müşteri dosyalarını Drive API v3 ile indirir.
// - OAuth yoksa herkese açık Drive linklerini indirir; kilitliyse açık uyarı verir.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { EngineError } from "./errors.ts";
import { sniffFormat, SUPPORTED_EXTS } from "./index.ts";
import { candidateSkus } from "./sku-finder.ts";

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

export function extractGoogleDriveFolderId(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const s = rawUrl.trim();
  const m = s.match(/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders|folderview\?[^#]*id=)\/?([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : null;
}

export function findCustomDesignUrl(item: { url?: string | null; image_src?: string | null } | null | undefined): string | null {
  if (!item) return null;
  const candidates = [item.url, ...(item.image_src ? item.image_src.split("|") : [])].filter(Boolean) as string[];
  for (const c of candidates) {
    const trimmed = c.trim();
    if (extractGoogleDriveFolderId(trimmed) || extractGoogleDriveId(trimmed)) return trimmed;
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

async function resolveFileIdFromFolder(
  folderId: string,
  sku: string | undefined,
  accessToken: string | null | undefined,
): Promise<{ fileId: string; fileName: string }> {
  if (!accessToken) {
    // OAuth yoksa herkese açık klasör gömülü görünümünden dosya ID'si yakalamayı dene
    const embedUrl = `https://drive.google.com/embeddedfolderview?id=${folderId}#list`;
    const r = await fetch(embedUrl, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (DKM-Takip)" } });
    const html = await r.text();
    if (/ServiceLogin|accounts\.google\.com/i.test(r.url) || /<title>Google Drive: Sign-in/i.test(html)) {
      throw new EngineError(
        "SOURCE_UNAVAILABLE",
        "Bu müşteri Google Drive klasörü özel/paylaşımlı (giriş gerektiriyor). Ayarlar > Google Drive Bağlantısı bölümünden şirket Google hesabınızı bir kez bağlayın.",
      );
    }
    const entries: { id: string; name: string }[] = [];
    const re = /href="https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,})[^"]*"[^>]*>[\s\S]*?flip-entry-title">([^<]+)</g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      entries.push({ id: m[1], name: m[2].trim() });
    }
    if (entries.length === 0) {
      throw new EngineError(
        "SOURCE_UNAVAILABLE",
        "Google Drive klasörü okunamadı veya boş. Özel klasörleri otomatik açmak için Ayarlar > Google Drive Bağlantısı bölümünden Google hesabınızı bağlayın.",
      );
    }
    return pickBestFolderFile(entries, sku);
  }

  // Resmi Google Drive API v3 ile klasör içeriğini listele (özel + ortak drive dahil)
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`);
  const apiUrl = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const r = await fetch(apiUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new EngineError("SOURCE_UNAVAILABLE", `Google Drive klasörü okunamadı (HTTP ${r.status}): ${txt.slice(0, 160)}`);
  }
  const data = (await r.json()) as { files?: { id: string; name: string; mimeType?: string; size?: string }[] };
  const files = (data.files || []).filter((f) => {
    const ext = path.extname(f.name || "").toLowerCase();
    return SUPPORTED_EXTS.includes(ext) || (f.mimeType || "").startsWith("image/");
  });
  if (files.length === 0) {
    throw new EngineError(
      "DESIGN_NOT_FOUND",
      `Google Drive klasöründe desteklenen görsel (TIFF, PSD, PSB, JPG, PNG) bulunamadı (toplam ${data.files?.length || 0} dosya).`,
    );
  }
  return pickBestFolderFile(files, sku);
}

function pickBestFolderFile(files: { id: string; name: string }[], rawSku?: string): { fileId: string; fileName: string } {
  if (files.length === 1) return { fileId: files[0].id, fileName: files[0].name };
  if (rawSku) {
    let cands: string[] = [rawSku.trim().toLowerCase()];
    try {
      cands = candidateSkus(rawSku).map((c) => c.toLowerCase());
    } catch {}
    // 1. Tam dosya adı (uzantısız) eşleşmesi
    for (const c of cands) {
      const exact = files.find((f) => path.basename(f.name, path.extname(f.name)).trim().toLowerCase() === c);
      if (exact) return { fileId: exact.id, fileName: exact.name };
    }
    // 2. Dosya adı içinde SKU geçiyorsa
    for (const c of cands) {
      const partial = files.find((f) => f.name.toLowerCase().includes(c));
      if (partial) return { fileId: partial.id, fileName: partial.name };
    }
  }
  // 3. Desteklenen ilk yüksek öncelikli baskı dosyasını seç (TIFF/PSD/PSB > PNG > JPG)
  const rank = (name: string) => {
    const e = path.extname(name).toLowerCase();
    if (e === ".tif" || e === ".tiff") return 5;
    if (e === ".psd" || e === ".psb") return 4;
    if (e === ".png") return 3;
    if (e === ".jpg" || e === ".jpeg") return 2;
    return 1;
  };
  const sorted = [...files].sort((a, b) => rank(b.name) - rank(a.name));
  return { fileId: sorted[0].id, fileName: sorted[0].name };
}

export async function fetchCustomDesignToCache(
  rawUrl: string,
  cacheDir: string,
  opts: { sku?: string; accessToken?: string | null } = {},
): Promise<{ filePath: string; cacheHit: boolean; sourceLabel: string }> {
  const driveDir = path.join(cacheDir, "drive");
  await fs.promises.mkdir(driveDir, { recursive: true });

  const folderId = extractGoogleDriveFolderId(rawUrl);
  let driveId = extractGoogleDriveId(rawUrl);
  let resolvedName = "";

  if (folderId && !driveId) {
    const picked = await resolveFileIdFromFolder(folderId, opts.sku, opts.accessToken);
    driveId = picked.fileId;
    resolvedName = picked.fileName;
  }

  const key = driveId ? `gdrive_${driveId}` : `url_${crypto.createHash("sha1").update(rawUrl).digest("hex").slice(0, 20)}`;

  for (const ext of [".tif", ".psd", ".psb", ".jpg", ".png"]) {
    const existing = path.join(driveDir, `${key}${ext}`);
    if (fs.existsSync(existing) && fs.statSync(existing).size > 100) {
      return {
        filePath: existing,
        cacheHit: true,
        sourceLabel: driveId ? `Google Drive (${resolvedName || driveId})` : rawUrl,
      };
    }
  }

  let downloadUrl = rawUrl.trim();
  const reqHeaders: Record<string, string> = { "User-Agent": "Mozilla/5.0 (DKM-Takip)" };

  if (driveId && opts.accessToken) {
    // Resmi Drive API v3 (özel paylaşımlı + büyük dosyalar dahil)
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${driveId}?alt=media&supportsAllDrives=true`;
    reqHeaders.Authorization = `Bearer ${opts.accessToken}`;
  } else if (driveId) {
    downloadUrl = `https://drive.usercontent.google.com/download?id=${driveId}&export=download&confirm=t`;
  } else if (/dropbox\.com/i.test(downloadUrl)) {
    if (downloadUrl.includes("dl=0")) downloadUrl = downloadUrl.replace("dl=0", "dl=1");
    else if (!downloadUrl.includes("dl=1")) downloadUrl += (downloadUrl.includes("?") ? "&" : "?") + "dl=1";
  }

  let res: Response;
  try {
    res = await fetch(downloadUrl, { redirect: "follow", headers: reqHeaders });
  } catch (e: any) {
    throw new EngineError("SOURCE_UNAVAILABLE", `Google Drive / harici tasarım indirilemedi: ${e?.message || e}`);
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      throw new EngineError(
        "SOURCE_UNAVAILABLE",
        `Google Drive dosyasına erişilemedi (HTTP ${res.status}). ${opts.accessToken ? "Bağlı Google hesabının bu dosya/klasörde görüntüleme izni olduğundan emin olun." : "Ayarlar > Google Drive Bağlantısı bölümünden Google hesabınızı bağlayın."}`,
      );
    }
    throw new EngineError("SOURCE_UNAVAILABLE", `Google Drive bağlantısı HTTP ${res.status} döndü.`);
  }

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("text/html")) {
    if (driveId) {
      throw new EngineError(
        "SOURCE_UNAVAILABLE",
        "Google Drive dosyası özel/kilitli (giriş sayfası döndü). Ayarlar > Google Drive Bağlantısı bölümünden şirket Google hesabınızı bağlayın.",
      );
    }
    throw new EngineError(
      "SOURCE_UNAVAILABLE",
      "Bu bağlantı (SendGB / WeTransfer vb.) doğrudan dosya yerine web sayfası/doğrulama döndürdü. Dosyayı tarayıcıdan indirip 'Bilgisayardan Dosya Seç' butonuyla anında taslak oluşturabilirsiniz.",
    );
  }

  const tmp = path.join(driveDir, `${key}.${process.pid}.${Date.now()}.tmp`);
  try {
    // Akışlı (streaming) indirme — 500 MB+ dosyalarda RAM'i şişirmez!
    if (res.body) {
      const ws = fs.createWriteStream(tmp);
      await pipeline(Readable.fromWeb(res.body as any), ws);
    } else {
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.promises.writeFile(tmp, buf);
    }
    const st = await fs.promises.stat(tmp);
    if (st.size < 32) throw new EngineError("CORRUPT_FILE", "İndirilen Google Drive dosyası boş veya çok küçük.");

    // İlk 64 baytı okuyup HTML izin sayfası olup olmadığını kontrol et
    const fh = await fs.promises.open(tmp, "r");
    const headBuf = Buffer.alloc(64);
    await fh.read(headBuf, 0, 64, 0);
    await fh.close();
    const headStr = headBuf.toString("latin1").trim().toLowerCase();
    if (headStr.startsWith("<!doctype html") || headStr.startsWith("<html")) {
      await fs.promises.rm(tmp, { force: true });
      throw new EngineError(
        "SOURCE_UNAVAILABLE",
        "Google Drive erişim izni gerekli. Ayarlar > Google Drive Bağlantısı bölümünden Google hesabınızı bağlayın.",
      );
    }

    const sn = await sniffFormat(tmp);
    if (!sn.format) {
      await fs.promises.rm(tmp, { force: true });
      throw new EngineError(
        "UNSUPPORTED_FORMAT",
        `Google Drive'dan indirilen dosya (${resolvedName || driveId}) desteklenmeyen biçimde (${sn.detail}). Desteklenen: TIFF, PSD, PSB, JPG, PNG.`,
      );
    }

    const finalPath = path.join(driveDir, `${key}${extFromFormat(sn.format)}`);
    await fs.promises.rename(tmp, finalPath);
    return {
      filePath: finalPath,
      cacheHit: false,
      sourceLabel: driveId ? `Google Drive (${resolvedName || driveId})` : rawUrl,
    };
  } catch (e) {
    await fs.promises.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
}
