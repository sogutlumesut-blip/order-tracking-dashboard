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
const SKIP_DIRS = new Set(["dkmtakip baski", "dkmtakip baskı", "print_ready", "dkm_office_out", "dkm_demo", "$recycle.bin", "system volume information"]);

// Sipariş SKU'sundaki ölçü (örn. -140x90, -300x250cm) ve malzeme eklerini (örn. -NW, -PS, -DOKULU) ayıklayarak yedek arama adayları üretir
const DIM_SUFFIX_RE = /[-_]\d+(?:\.\d+)?[xX×]\d+(?:\.\d+)?(?:cm|in|mm|ft|m)?$/i;
const MATERIAL_SUFFIX_RE =
  /[-_](NW|PS|TX|VN|CV|DL|PR|SM|ST|DOKULU|DOKUSUZ|TEKSTIL|TEKSTİL|VINIL|VİNİL|KANVAS|CANVAS|NONWOVEN|NON-WOVEN|KUMAS|KUMAŞ|PEEL|PEELSTICK|STICK|DELUXE|PREMIUM|MAT|MATTE|PARLAK|GLOSS|KAGIT|KAĞIT|SMOOTH|TEXTURED|LINEN|SILK|PAPER|MURAL)$/i;
const BASE_CODE_RE = /^([A-Za-z]{1,6}\d{2,6})[-_]/;

export function candidateSkus(rawSku: string): string[] {
  const clean = validateSku(rawSku);
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (v: string) => {
    const t = v.trim();
    if (!t || !SKU_RE.test(t)) return;
    const k = t.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(t);
    }
  };

  push(clean);

  // Adım adım sondaki ölçü ve malzeme eklerini soy (örn. SH1550-NW-140x90 -> SH1550-NW -> SH1550)
  let cur = clean;
  for (let i = 0; i < 4; i++) {
    const next = cur.replace(DIM_SUFFIX_RE, "").replace(MATERIAL_SUFFIX_RE, "").trim();
    if (!next || next.toLowerCase() === cur.toLowerCase()) break;
    push(next);
    cur = next;
  }

  // En son yedek: baştaki temel desen kodu (örn. SH1550-ABC-123 -> SH1550)
  const m = clean.match(BASE_CODE_RE);
  if (m && m[1]) push(m[1]);

  return out;
}

// 2.98 TB SMB paylaşımını her seferinde baştan taramamak için hızlı bellek içi dosya adı indeksi (15 dk TTL)
interface DirIndex {
  root: string;
  builtAt: number;
  byStem: Map<string, { full: string; ext: string }[]>;
}
const indexCache = new Map<string, DirIndex>();
const INDEX_TTL_MS = 15 * 60 * 1000;

async function buildDirIndex(designsDir: string): Promise<DirIndex> {
  const byStem = new Map<string, { full: string; ext: string }[]>();
  const queue: { dir: string; depth: number }[] = [{ dir: designsDir, depth: 0 }];
  let cursor = 0;

  const worker = async () => {
    while (cursor < queue.length) {
      const item = queue[cursor++];
      if (item.depth > 6) continue;
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(item.dir, { withFileTypes: true });
      } catch (e: any) {
        if (item.depth === 0) {
          throw new EngineError("SOURCE_UNAVAILABLE", `Klasör okunamadı (${e.code || e.message}): ${item.dir}`);
        }
        continue;
      }
      for (const ent of entries) {
        if (ent.name.startsWith(".") || ent.name.startsWith("~$")) continue;
        const full = path.join(item.dir, ent.name);
        if (ent.isDirectory()) {
          if (SKIP_DIRS.has(ent.name.toLowerCase())) continue;
          queue.push({ dir: full, depth: item.depth + 1 });
        } else if (ent.isFile()) {
          const ext = path.extname(ent.name).toLowerCase();
          const stem = path.basename(ent.name, path.extname(ent.name)).trim().toLowerCase();
          if (!stem) continue;
          let arr = byStem.get(stem);
          if (!arr) {
            arr = [];
            byStem.set(stem, arr);
          }
          arr.push({ full, ext });
        }
      }
    }
  };

  await Promise.all(Array.from({ length: 12 }, () => worker()));
  const idx: DirIndex = { root: designsDir, builtAt: Date.now(), byStem };
  indexCache.set(designsDir, idx);
  return idx;
}

export async function warmSkuIndex(designsDir: string): Promise<number> {
  if (!designsDir || !fs.existsSync(designsDir)) return 0;
  const idx = await buildDirIndex(designsDir);
  return idx.byStem.size;
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

const SAMPLE_DIR_RE = /(?:^|[\\/])(yurtd[ıi]s[ıi]sample|sample|samples|numune|test)(?:[\\/]|$)/i;

function pickBestLiveMatch(matches: string[]): string {
  const nonSample = matches.filter((m) => !SAMPLE_DIR_RE.test(m));
  const pool = nonSample.length > 0 ? nonSample : matches;
  if (pool.length === 1) return pool[0];
  const extRank = (p: string) => {
    const e = path.extname(p).toLowerCase();
    if (e === ".tif" || e === ".tiff") return 4;
    if (e === ".psb" || e === ".psd") return 3;
    if (e === ".png") return 2;
    return 1;
  };
  let best = pool[0];
  let bestScore = -1;
  for (const p of pool) {
    try {
      const sz = fs.statSync(p).size;
      const score = extRank(p) * 1e13 + sz;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    } catch {}
  }
  return best;
}

// Hızlı 1-seviye doğrudan kontrol: tam 2.98 TB SMB taramasına gerek kalmadan ~50ms içinde bulur
async function quickTopLevelProbe(designsDir: string, candidates: string[]): Promise<string | null> {
  let topEntries: fs.Dirent[];
  try {
    topEntries = await fs.promises.readdir(designsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  const searchDirs = [designsDir];
  for (const ent of topEntries) {
    if (!ent.isDirectory() || ent.name.startsWith(".") || ent.name.startsWith("~$")) continue;
    if (SKIP_DIRS.has(ent.name.toLowerCase()) || SAMPLE_DIR_RE.test(ent.name)) continue;
    searchDirs.push(path.join(designsDir, ent.name));
  }

  for (const cand of candidates) {
    const hits: string[] = [];
    const checks: Promise<void>[] = [];
    for (const dir of searchDirs) {
      for (const ext of SUPPORTED_EXTS) {
        const p = path.join(dir, `${cand}${ext}`);
        checks.push(
          fs.promises
            .access(p, fs.constants.R_OK)
            .then(() => {
              hits.push(p);
            })
            .catch(() => {}),
        );
      }
    }
    await Promise.all(checks);
    if (hits.length > 0) return pickBestLiveMatch(hits);
  }
  return null;
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

  const useCache = process.env.DKM_DEMO_TEST_MODE !== "1";

  const lookupInIndex = (idx: DirIndex) => {
    const supportedByCand: string[][] = candidates.map(() => []);
    const unsupportedByCand: string[][] = candidates.map(() => []);
    for (let i = 0; i < candidates.length; i++) {
      const hits = idx.byStem.get(candidates[i].toLowerCase()) || [];
      for (const h of hits) {
        if (SUPPORTED_EXTS.includes(h.ext)) supportedByCand[i].push(h.full);
        else if (KNOWN_UNSUPPORTED_EXTS.has(h.ext) || h.ext) unsupportedByCand[i].push(h.full);
      }
    }
    return { supportedByCand, unsupportedByCand };
  };

  let idx = useCache ? indexCache.get(designsDir) : undefined;

  // Eğer tam indeks henüz hazır değilse önce ~50ms süren hızlı 1-seviye kontrol yap (zaman aşımını önler!)
  if (useCache && (!idx || Date.now() - idx.builtAt > INDEX_TTL_MS)) {
    const quickHit = await quickTopLevelProbe(designsDir, candidates);
    if (quickHit) return quickHit;
  }

  if (!idx || Date.now() - idx.builtAt > INDEX_TTL_MS) {
    idx = await buildDirIndex(designsDir);
  }

  let { supportedByCand, unsupportedByCand } = lookupInIndex(idx);

  // Önbellekte bulunamadıysa (yeni eklenmiş dosya olabilir), önce hızlı probe, yoksa tazele
  const hasAnyHit = supportedByCand.some((a) => a.length > 0) || unsupportedByCand.some((a) => a.length > 0);
  if (!hasAnyHit && useCache) {
    const quickHit = await quickTopLevelProbe(designsDir, candidates);
    if (quickHit) return quickHit;
    if (Date.now() - idx.builtAt > 10_000) {
      idx = await buildDirIndex(designsDir);
      ({ supportedByCand, unsupportedByCand } = lookupInIndex(idx));
    }
  }

  for (let i = 0; i < candidates.length; i++) {
    const supported = supportedByCand[i];
    const unsupported = unsupportedByCand[i];
    if (supported.length > 1) {
      if (useCache) {
        const best = pickBestLiveMatch(supported);
        if (fs.existsSync(best)) return best;
      }
      const names = supported.map((m) => path.relative(designsDir, m));
      throw new EngineError(
        "MULTIPLE_MATCH",
        `SKU "${candidates[i]}" için birden fazla desteklenen dosya bulundu (${supported.length} adet): ${names.join(", ")}. Belirsizlik nedeniyle işlem durduruldu.`,
        { matches: names },
      );
    }
    if (supported.length === 1) {
      if (fs.existsSync(supported[0])) return supported[0];
    }
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

  throw new EngineError("DESIGN_NOT_FOUND", `SKU "${sku}" (denenen: ${candidates.join(", ")}) için tasarım dosyası bulunamadı (aranan klasör: ${designsDir})`);
}
