// Ölçü birimi dönüşümleri ve sipariş ölçüsü doğrulama

export type Unit = "cm" | "mm" | "m" | "in" | "ft";

export const UNIT_TO_INCH: Record<Unit, number> = {
  mm: 1 / 25.4,
  cm: 1 / 2.54,
  m: 100 / 2.54,
  in: 1,
  ft: 12,
};

export interface Dim {
  width: number;
  height: number;
  unit: Unit;
}

export class DimensionError extends Error {
  code = "INVALID_DIMENSIONS";
}

export function normalizeUnit(u: string | null | undefined): Unit | null {
  if (!u) return null;
  const s = u.trim().toLowerCase().replace(/\.$/, "");
  if (["cm", "santim", "santimetre"].includes(s)) return "cm";
  if (["mm", "milimetre"].includes(s)) return "mm";
  if (["m", "mt", "metre", "meter"].includes(s)) return "m";
  if (["in", "inch", "inches", "inç", "inc", '"', "″"].includes(s)) return "in";
  if (["ft", "feet", "foot", "'"].includes(s)) return "ft";
  return null;
}

// "300x250 cm", "120 x 80.5cm", "96\" x 120\"", "1,5 x 2 m"
export function parseDimensionString(raw: string, fallbackUnit?: string): Dim {
  if (!raw || typeof raw !== "string") throw new DimensionError("Ölçü boş");
  const s = raw.trim().replace(/,/g, ".").replace(/×/g, "x");
  const m = s.match(/^\s*(\d+(?:\.\d+)?)\s*(cm|mm|m|in|inch|inç|"|ft)?\s*[x*X]\s*(\d+(?:\.\d+)?)\s*(cm|mm|m|in|inches|inch|inç|"|ft)?\s*$/i);
  if (!m) throw new DimensionError(`Ölçü biçimi anlaşılamadı: "${raw}"`);
  const unit = normalizeUnit(m[4] || m[2] || fallbackUnit || "");
  if (!unit) throw new DimensionError(`Ölçü birimi belirtilmemiş veya desteklenmiyor: "${raw}"`);
  return validateDim({ width: Number(m[1]), height: Number(m[3]), unit });
}

export interface DimLimits {
  maxSideCm: number; // örn. 2000 cm
  minSideCm: number; // örn. 1 cm
}

export const DEFAULT_LIMITS: DimLimits = { maxSideCm: 2000, minSideCm: 1 };

export function validateDim(d: { width: any; height: any; unit: any }, limits: DimLimits = DEFAULT_LIMITS): Dim {
  const unit = normalizeUnit(String(d.unit ?? ""));
  if (!unit) throw new DimensionError(`Geçersiz ölçü birimi: "${d.unit}"`);
  const w = Number(d.width);
  const h = Number(d.height);
  if (!Number.isFinite(w) || !Number.isFinite(h)) throw new DimensionError("Genişlik/yükseklik sayı değil");
  if (w <= 0 || h <= 0) throw new DimensionError("Genişlik ve yükseklik sıfırdan büyük olmalı");
  const wCm = (w * UNIT_TO_INCH[unit]) * 2.54;
  const hCm = (h * UNIT_TO_INCH[unit]) * 2.54;
  if (wCm < limits.minSideCm || hCm < limits.minSideCm) throw new DimensionError(`Ölçü çok küçük (min ${limits.minSideCm} cm)`);
  if (wCm > limits.maxSideCm || hCm > limits.maxSideCm) throw new DimensionError(`Ölçü çok büyük (maks ${limits.maxSideCm} cm / kenar)`);
  return { width: w, height: h, unit };
}

export function toInches(d: Dim): { w: number; h: number } {
  return { w: d.width * UNIT_TO_INCH[d.unit], h: d.height * UNIT_TO_INCH[d.unit] };
}

export function formatDim(d: Dim): string {
  const f = (n: number) => (Math.round(n * 100) / 100).toString();
  return `${f(d.width)} × ${f(d.height)} ${d.unit === "in" ? "inç" : d.unit}`;
}
