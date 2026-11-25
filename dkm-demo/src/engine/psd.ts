// PSD / PSB okuyucu (Photoshop KULLANMADAN).
// Adobe Photoshop File Format Specification'a göre birleşik (merged/composite) görüntü verisini
// satır satır, bellek dostu biçimde çözer. 5-10 GB PSB dosyaları için tüm görüntü belleğe alınmaz:
// her kanal için ayrı sıralı okuyucu kullanılır (kanallar dosyada düzlemsel saklanır).
//
// Desteklenen: Sürüm 1 (PSD) ve 2 (PSB); renk modları Grayscale, RGB, CMYK; 8 ve 16 bit;
//              sıkıştırma Raw (0) ve RLE/PackBits (1).
// Desteklenmeyen (açık hata verilir): Bitmap, Indexed, Duotone, Lab, Multichannel, 32 bit,
//              ZIP sıkıştırmalı birleşik veri, birleşik verisi olmayan dosyalar.

import { SourceFile } from "./source-file.ts";
import { EngineError } from "./errors.ts";

export const COLOR_MODES: Record<number, string> = {
  0: "Bitmap",
  1: "Grayscale",
  2: "Indexed",
  3: "RGB",
  4: "CMYK",
  7: "Multichannel",
  8: "Duotone",
  9: "Lab",
};

export interface PsdInfo {
  version: 1 | 2;
  channels: number;
  width: number;
  height: number;
  depth: number;
  colorMode: number;
  colorModeName: string;
  compression: number;
  imageDataOffset: number; // sıkıştırma alanından hemen sonrası
  resolution: { x: number; y: number } | null; // PPI
  icc: Buffer | null;
  hasRealMergedData: boolean | null; // null = bilgi kaynağı yok
  layerSectionLength: number;
  outChannels: number; // çıktı renk kanalı sayısı (1/3/4)
  fileSize: number;
}

export async function readPsdInfo(src: SourceFile): Promise<PsdInfo> {
  if (src.size < 26) throw new EngineError("CORRUPT_FILE", "PSD başlığı eksik (dosya çok kısa)");
  const h = await src.readExact(26, 0);
  if (h.toString("latin1", 0, 4) !== "8BPS") throw new EngineError("CORRUPT_FILE", "PSD imzası (8BPS) bulunamadı");
  const version = h.readUInt16BE(4);
  if (version !== 1 && version !== 2) throw new EngineError("CORRUPT_FILE", `Bilinmeyen PSD sürümü: ${version}`);
  const channels = h.readUInt16BE(12);
  const height = h.readUInt32BE(14);
  const width = h.readUInt32BE(18);
  const depth = h.readUInt16BE(22);
  const colorMode = h.readUInt16BE(24);
  const maxDim = version === 1 ? 30000 : 300000;
  if (channels < 1 || channels > 56) throw new EngineError("CORRUPT_FILE", `Geçersiz kanal sayısı: ${channels}`);
  if (width < 1 || height < 1 || width > maxDim || height > maxDim) throw new EngineError("CORRUPT_FILE", `Geçersiz boyut: ${width}x${height}`);
  const colorModeName = COLOR_MODES[colorMode] || `Bilinmeyen(${colorMode})`;

  let pos = 26;
  const cmLen = (await src.readExact(4, pos)).readUInt32BE(0);
  pos += 4 + cmLen;
  if (pos + 4 > src.size) throw new EngineError("CORRUPT_FILE", "PSD bölümleri eksik (renk modu verisi)");
  const irLen = (await src.readExact(4, pos)).readUInt32BE(0);
  pos += 4;
  if (irLen > 512 * 1024 * 1024 || pos + irLen > src.size) throw new EngineError("CORRUPT_FILE", "Image Resources bölümü geçersiz");
  let resolution: PsdInfo["resolution"] = null;
  let icc: Buffer | null = null;
  let hasRealMergedData: boolean | null = null;
  if (irLen > 0) {
    const ir = await src.readExact(irLen, pos);
    let p = 0;
    while (p + 12 <= ir.length) {
      const sig = ir.toString("latin1", p, p + 4);
      if (sig !== "8BIM" && sig !== "MeSa" && sig !== "AgHg" && sig !== "PHUT" && sig !== "DCSR") break;
      const id = ir.readUInt16BE(p + 4);
      const nameLen = ir[p + 6];
      let q = p + 6 + 1 + nameLen;
      if ((1 + nameLen) % 2 === 1) q += 1; // pascal string çift sayıya tamamlanır
      if (q + 4 > ir.length) break;
      const size = ir.readUInt32BE(q);
      q += 4;
      if (q + size > ir.length) break;
      const data = ir.subarray(q, q + size);
      if (id === 0x03ed && size >= 16) {
        const hRes = data.readUInt32BE(0) / 65536;
        const vRes = data.readUInt32BE(8) / 65536;
        const hUnit = data.readUInt16BE(4); // 1 = PPI, 2 = PPCM
        const vUnit = data.readUInt16BE(12);
        resolution = { x: hUnit === 2 ? hRes * 2.54 : hRes, y: vUnit === 2 ? vRes * 2.54 : vRes };
      } else if (id === 0x040f && size > 0) {
        icc = Buffer.from(data);
      } else if (id === 0x0421 && size >= 5) {
        hasRealMergedData = data[4] !== 0;
      }
      p = q + size + (size % 2);
    }
  }
  pos += irLen;
  const lenSize = version === 1 ? 4 : 8;
  if (pos + lenSize > src.size) throw new EngineError("CORRUPT_FILE", "Layer & Mask bölümü eksik");
  const lb = await src.readExact(lenSize, pos);
  const layerSectionLength = version === 1 ? lb.readUInt32BE(0) : Number(lb.readBigUInt64BE(0));
  pos += lenSize + layerSectionLength;
  if (pos + 2 > src.size) throw new EngineError("CORRUPT_FILE", "Birleşik görüntü (Image Data) bölümü bulunamadı – dosya kesik olabilir");
  const compression = (await src.readExact(2, pos)).readUInt16BE(0);
  pos += 2;

  let outChannels = 0;
  if (colorMode === 1) outChannels = 1;
  else if (colorMode === 3) outChannels = 3;
  else if (colorMode === 4) outChannels = 4;

  return {
    version: version as 1 | 2,
    channels,
    width,
    height,
    depth,
    colorMode,
    colorModeName,
    compression,
    imageDataOffset: pos,
    resolution,
    icc,
    hasRealMergedData,
    layerSectionLength,
    outChannels,
    fileSize: src.size,
  };
}

export function assertPsdSupported(info: PsdInfo) {
  if (![1, 3, 4].includes(info.colorMode)) {
    throw new EngineError("UNSUPPORTED_FORMAT", `PSD renk modu desteklenmiyor: ${info.colorModeName}. Desteklenen: RGB, CMYK, Grayscale`);
  }
  if (info.depth !== 8 && info.depth !== 16) {
    throw new EngineError("UNSUPPORTED_FORMAT", `PSD bit derinliği desteklenmiyor: ${info.depth} bit. Desteklenen: 8 ve 16 bit`);
  }
  if (info.compression !== 0 && info.compression !== 1) {
    throw new EngineError("UNSUPPORTED_FORMAT", `PSD birleşik görüntü sıkıştırması desteklenmiyor: ${info.compression} (ZIP)`);
  }
  if (info.channels < info.outChannels) {
    throw new EngineError("CORRUPT_FILE", `Kanal sayısı renk modu için yetersiz (${info.channels} < ${info.outChannels})`);
  }
  if (info.hasRealMergedData === false) {
    throw new EngineError(
      "NO_COMPOSITE",
      "Bu PSD/PSB dosyası 'Maximize Compatibility' kapalı kaydedilmiş; dosyadaki birleşik görüntü gerçek tasarımı içermiyor. " +
        "Katmanları Photoshop olmadan güvenilir biçimde birleştirmek mümkün olmadığından işlem DURDURULDU. " +
        "Dosyayı 'Maximize Compatibility' açık olarak yeniden kaydedin veya TIFF olarak dışa aktarın.",
    );
  }
}

// PackBits çözümü. Satır tam olarak `out.length` bayta açılmazsa dosya bozuk kabul edilir.
export function unpackBits(src: Buffer, out: Buffer): void {
  let i = 0;
  let o = 0;
  const n = src.length;
  const outLen = out.length;
  while (i < n && o < outLen) {
    const hdr = src[i++];
    if (hdr < 128) {
      const cnt = hdr + 1;
      if (i + cnt > n || o + cnt > outLen) throw new EngineError("CORRUPT_FILE", "RLE verisi bozuk (literal taşma)");
      src.copy(out, o, i, i + cnt);
      i += cnt;
      o += cnt;
    } else if (hdr > 128) {
      const cnt = 257 - hdr;
      if (i >= n || o + cnt > outLen) throw new EngineError("CORRUPT_FILE", "RLE verisi bozuk (tekrar taşma)");
      out.fill(src[i++], o, o + cnt);
      o += cnt;
    }
    // 128: no-op
  }
  if (o !== outLen) throw new EngineError("CORRUPT_FILE", `RLE satırı eksik çözüldü (${o}/${outLen})`);
}

const CHUNK = 4 * 1024 * 1024;

// Bir kanal için sıralı, tamponlu okuyucu
class ChannelCursor {
  src: SourceFile;
  pos: number;
  end: number;
  buf: Buffer = Buffer.alloc(0);
  bufStart = 0; // buf[0]'ın dosyadaki konumu
  constructor(src: SourceFile, start: number, end: number) {
    this.src = src;
    this.pos = start;
    this.end = end;
    this.bufStart = start;
  }
  async take(len: number): Promise<Buffer> {
    const relStart = this.pos - this.bufStart;
    if (relStart + len > this.buf.length) {
      // tamponu yeniden doldur
      const want = Math.max(len, Math.min(CHUNK, this.end - this.pos));
      if (this.pos + len > this.end) throw new EngineError("CORRUPT_FILE", "Kanal verisi beklenenden kısa (dosya kesik)");
      this.buf = await this.src.readExact(want, this.pos);
      this.bufStart = this.pos;
    }
    const r = this.pos - this.bufStart;
    const out = this.buf.subarray(r, r + len);
    this.pos += len;
    return out;
  }
}

export interface RowReader {
  width: number;
  height: number;
  outChannels: number;
  // Bir sonraki satırı 8-bit, kanalları iç içe (interleaved) olarak döndürür.
  // CMYK için TIFF kuralına göre (0 = mürekkep yok) çevrilmiş değerler döner.
  nextRow(): Promise<Buffer>;
  // Satır aralığına atlama (detay görünümü için): satır numarasından başlat
  row: number;
}

export async function openRowReader(src: SourceFile, info: PsdInfo, startRow = 0): Promise<RowReader> {
  assertPsdSupported(info);
  const { width, height, depth, compression, version } = info;
  const bpc = depth / 8;
  const rowBytes = width * bpc;
  const nOut = info.outChannels;
  const cursors: ChannelCursor[] = [];
  let counts: Uint32Array[] = [];

  if (compression === 0) {
    const chanSize = rowBytes * height;
    const needEnd = info.imageDataOffset + chanSize * info.channels;
    if (needEnd > src.size) {
      throw new EngineError("CORRUPT_FILE", `Birleşik görüntü verisi kesik: beklenen ${needEnd} bayt, dosya ${src.size} bayt`);
    }
    for (let c = 0; c < nOut; c++) {
      const start = info.imageDataOffset + c * chanSize + startRow * rowBytes;
      cursors.push(new ChannelCursor(src, start, info.imageDataOffset + (c + 1) * chanSize));
    }
  } else {
    const entry = version === 1 ? 2 : 4;
    const tableLen = info.channels * height * entry;
    if (info.imageDataOffset + tableLen > src.size) throw new EngineError("CORRUPT_FILE", "RLE satır tablosu kesik");
    const table = await src.readExact(tableLen, info.imageDataOffset);
    const all = new Uint32Array(info.channels * height);
    let total = 0;
    for (let i = 0; i < all.length; i++) {
      const v = entry === 2 ? table.readUInt16BE(i * 2) : table.readUInt32BE(i * 4);
      all[i] = v;
      total += v;
    }
    const dataStart = info.imageDataOffset + tableLen;
    if (dataStart + total > src.size) {
      throw new EngineError("CORRUPT_FILE", `RLE görüntü verisi kesik: beklenen ${dataStart + total} bayt, dosya ${src.size} bayt`);
    }
    let off = dataStart;
    for (let c = 0; c < info.channels; c++) {
      const cc = all.subarray(c * height, (c + 1) * height);
      let chanLen = 0;
      for (let r = 0; r < height; r++) chanLen += cc[r];
      if (c < nOut) {
        let skip = 0;
        for (let r = 0; r < startRow; r++) skip += cc[r];
        cursors.push(new ChannelCursor(src, off + skip, off + chanLen));
        counts.push(cc);
      }
      off += chanLen;
    }
  }

  const planes: Buffer[] = Array.from({ length: nOut }, () => Buffer.allocUnsafe(rowBytes));
  const out = Buffer.allocUnsafe(width * nOut);
  const invert = info.colorMode === 4; // PSD CMYK: 255 = mürekkep yok → TIFF: 0 = mürekkep yok

  const reader: RowReader = {
    width,
    height,
    outChannels: nOut,
    row: startRow,
    async nextRow() {
      const r = reader.row;
      if (r >= height) throw new Error("satır sonu aşıldı");
      for (let c = 0; c < nOut; c++) {
        if (compression === 0) {
          const b = await cursors[c].take(rowBytes);
          b.copy(planes[c]);
        } else {
          const b = await cursors[c].take(counts[c][r]);
          unpackBits(b, planes[c]);
        }
      }
      // iç içe yerleştir + 16→8 bit
      if (bpc === 1) {
        for (let c = 0; c < nOut; c++) {
          const p = planes[c];
          if (invert) for (let x = 0, o = c; x < width; x++, o += nOut) out[o] = 255 - p[x];
          else for (let x = 0, o = c; x < width; x++, o += nOut) out[o] = p[x];
        }
      } else {
        for (let c = 0; c < nOut; c++) {
          const p = planes[c];
          for (let x = 0, o = c; x < width; x++, o += nOut) {
            const v16 = (p[x * 2] << 8) | p[x * 2 + 1];
            const v8 = (v16 * 255 + 32767) / 65535 | 0;
            out[o] = invert ? 255 - v8 : v8;
          }
        }
      }
      reader.row++;
      return out;
    },
  };
  return reader;
}
