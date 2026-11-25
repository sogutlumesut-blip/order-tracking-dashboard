// Yerel Görsel Parmak İzi (Perceptual dHash + 4x4 RGB Renk Izgarası)
// - Ek API maliyeti olmadan tamamen yerel (sharp/libvips) çalışır.
// - SKU eşleşmediğinde sipariş görselinden Windows Server'daki en benzer tasarımları bulur.

import sharp from "sharp";

// Format: "<16-hex-dHash>:<96-hex-rgb4x4>"
export async function computeVisualSignature(input: string | Buffer): Promise<string> {
  const base = sharp(input, { limitInputPixels: false, failOn: "none" }).rotate().flatten({ background: "#ffffff" });

  // 1. 64-bit dHash (9x8 gri tonlama, yatay komşu piksel karşılaştırması)
  const gray = await base.clone().resize(9, 8, { fit: "fill" }).greyscale().raw().toBuffer();
  let bits = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = gray[y * 9 + x];
      const right = gray[y * 9 + x + 1];
      bits = (bits << 1n) | (left > right ? 1n : 0n);
    }
  }
  const dHashHex = bits.toString(16).padStart(16, "0");

  // 2. 4x4 RGB renk imzası (16 hücre x 3 kanal = 48 bayt)
  const rgb = await base.clone().resize(4, 4, { fit: "fill" }).toColourspace("srgb").removeAlpha().raw().toBuffer();
  const rgbHex = rgb.subarray(0, 48).toString("hex");

  return `${dHashHex}:${rgbHex}`;
}

function popcount64(x: bigint): number {
  let c = 0;
  let v = x;
  while (v > 0n) {
    v &= v - 1n;
    c++;
  }
  return c;
}

// İki görsel imza arasında 0-100 arası benzerlik yüzdesi hesaplar
export function compareVisualSignatures(sigA: string, sigB: string): number {
  const [hA, cA] = sigA.split(":");
  const [hB, cB] = sigB.split(":");
  if (!hA || !hB || !cA || !cB) return 0;

  // 1. Yapısal benzerlik (dHash Hamming uzaklığı: 0..64)
  const xor = BigInt("0x" + hA) ^ BigInt("0x" + hB);
  const hamming = popcount64(xor);
  const structScore = Math.max(0, 1 - hamming / 64);

  // 2. Renk ve kompozisyon benzerliği (4x4 RGB L1 uzaklığı)
  const bA = Buffer.from(cA, "hex");
  const bB = Buffer.from(cB, "hex");
  const len = Math.min(bA.length, bB.length);
  let diff = 0;
  for (let i = 0; i < len; i++) diff += Math.abs(bA[i] - bB[i]);
  const colorScore = len > 0 ? Math.max(0, 1 - diff / (len * 255)) : 0;

  // Ağırlıklı birleşim (%55 renk/kompozisyon + %45 doku/yapı — duvar kağıdı desenlerinde yüksek isabet)
  return Number(((colorScore * 0.55 + structScore * 0.45) * 100).toFixed(1));
}
