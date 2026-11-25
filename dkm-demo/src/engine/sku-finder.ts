// SKU ile tasarım dosyası arama (salt okunur).
// - Geçersiz SKU veya yol geçişi (../) reddedilir.
// - Klasör erişilemezse SOURCE_UNAVAILABLE döner.
// - Birden fazla dosya eşleşirse MULTIPLE_MATCH döner (asla tahmin yapmaz).
// - Desteklenmeyen uzantı (örn. .pdf, .ai, .eps) varsa UNSUPPORTED_FORMAT döner.

import fs from "node:fs";
import path from "node:path";
import { EngineError } from "./errors.ts";
import { SUPPORTED_EXTS } from "./index.ts";

const SKU_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;
const KNOWN_UNSUPPORTED_EXTS = new Set([".pdf", ".ai", ".eps", ".cdr", ".svg", ".webp", ".bmp", ".heic", ".raw", ".cr2", ".nef", ".txt", ".zip"]);

// Sipariş SKU'sundaki malzeme eklerini (örn. SH2420-DOKULU -> SH2420) ayıklayarak yedek arama adayı üretir
const MATERIAL_SUFFIX_RE = /[-_](DOKULU|DOKUSUZ|TEKSTIL|TEKSTİL|VINIL|VİNİL|KANVAS|CANVAS|NONWOVEN|KUMAS|KUMAŞ|PEEL|DELUXE|PREMIUM|MAT|PARLAK|KAGIT|KAĞIT)$/i;

export function candidateSkus(rawSku: string): string[] {
  const clean = validateSku(rawSku);
  const out = [clean];
  const stripped = clean.replace(MATERIAL_SUFFIX_RE, "").trim();
  if (stripped && stripped.toLowerCase() !== clean.toLowerCase() && SKU_RE.test(stripped)) {
    out.push(stripped);
  }
  return out;
}

export function validateSku(sku: string | null | undefined): string {
  const s = (sku || "").trim();
  if (!s) throw new EngineError("INVALID_SKU", "SKU boş olamaz");
  if (s.includes("..") || s.includes("/") || s.includes("\\")) {
    throw new EngineError("INVALID_SKU", `SKU içinde geçersiz yol karakteri var: "${s}"`);
  }
  if (!SKU_RE.test(s)) {
    throw new EngineError("INVALID_SKU", `Geçersiz SKU biçimi: "${s}" (en az 3 karakter, harf/rakam/tire/altçizgi)`);
  }
  return s;
}

export async function findDesignBySku(designsDir: string, rawSku: string): Promise<string> {
  const candidates = candidateSkus(rawSku);
  const sku = candidates[0];

  let st: fs.Stats;
  try {
    st = await fs.promises.stat(designsDir);
  } catch (e: any) {
    throw new EngineError("SOURCE_UNAVAILABLE", `Tasarım klasörüne erişilemiyor (${e.code || e.message}): ${designsDir}`);
  }
  if (!st.isDirectory()) {
    throw new EngineError("SOURCE_UNAVAILABLE", `Tasarım yolu bir klasör değil: ${designsDir}`);
  }

  // Test modunda sunucu kopması simülasyonu
  if (process.env.DKM_DEMO_TEST_MODE === "1" && (process.env.DKM_FAULT || "").includes("source_offline")) {
    throw new EngineError("SOURCE_UNAVAILABLE", "Simüle edilmiş tasarım sunucusu bağlantı kesintisi [test]");
  }

  const candidateLowers = candidates.map((c) => c.toLowerCase());
  const supportedByCand: string[][] = candidates.map(() => []);
  const unsupportedByCand: string[][] = candidates.map(() => []);

  async function walk(dir: string, depth: number) {
    if (depth > 6) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (e: any) {
      throw new EngineError("SOURCE_UNAVAILABLE", `Klasör okunamadı (${e.code || e.message}): ${dir}`);
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".") || ent.name.startsWith("~$")) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(full, depth + 1);
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        // Dosya adındaki sondaki/baştaki boşlukları temizle (örn. "SH2420 .jpg" -> "sh2420")
        const stem = path.basename(ent.name, path.extname(ent.name)).trim().toLowerCase();
        const idx = candidateLowers.indexOf(stem);
        if (idx !== -1) {
          if (SUPPORTED_EXTS.includes(ext)) {
            supportedByCand[idx].push(full);
          } else if (KNOWN_UNSUPPORTED_EXTS.has(ext) || ext) {
            unsupportedByCand[idx].push(full);
          }
        }
      }
    }
  }

  await walk(designsDir, 0);

  for (let i = 0; i < candidates.length; i++) {
    const supported = supportedByCand[i];
    const unsupported = unsupportedByCand[i];
    if (supported.length > 1) {
      const names = supported.map((m) => path.relative(designsDir, m));
      throw new EngineError(
        "MULTIPLE_MATCH",
        `SKU "${candidates[i]}" için birden fazla desteklenen dosya bulundu (${supported.length} adet): ${names.join(", ")}. Belirsizlik nedeniyle işlem durduruldu.`,
        { matches: names },
      );
    }
    if (supported.length === 1) return supported[0];
    if (unsupported.length > 1) {
      const names = unsupported.map((m) => path.relative(designsDir, m));
      throw new EngineError(
        "MULTIPLE_MATCH",
        `SKU "${candidates[i]}" için birden fazla dosya bulundu: ${names.join(", ")}.`,
        { matches: names },
      );
    }
    if (unsupported.length === 1) {
      throw new EngineError(
        "UNSUPPORTED_FORMAT",
        `SKU "${candidates[i]}" için bulunan dosya desteklenmeyen biçimde: ${path.basename(unsupported[0])}`,
      );
    }
  }

  throw new EngineError("DESIGN_NOT_FOUND", `SKU "${sku}" için tasarım dosyası bulunamadı (aranan klasör: ${designsDir})`);
}
