// Akışlı (streaming) TIFF / BigTIFF yazıcı.
// PSD/PSB birleşik görüntüsü satır satır bu yazıcıya aktarılır; böylece çok büyük dosyalar
// belleğe tamamen alınmadan CACHE klasöründe libvips'in okuyabileceği bir ara dosyaya dönüşür.

import fs from "node:fs";
import zlib from "node:zlib";
import { promisify } from "node:util";

const deflate = promisify(zlib.deflate);

export interface TiffWriterOpts {
  width: number;
  height: number;
  samples: 1 | 3 | 4;
  photometric: 1 | 2 | 5; // 1 gri, 2 RGB, 5 CMYK (separated)
  xRes?: number; // PPI
  yRes?: number;
  icc?: Buffer | null;
  bigtiff?: boolean;
  compression?: "deflate" | "none";
  level?: number;
  targetStripBytes?: number;
}

const T = { SHORT: 3, LONG: 4, RATIONAL: 5, UNDEFINED: 7, ASCII: 2, LONG8: 16 };

export class TiffStripWriter {
  o: Required<Omit<TiffWriterOpts, "icc" | "xRes" | "yRes">> & { icc: Buffer | null; xRes: number; yRes: number };
  fd: number;
  pos: number;
  rowBytes: number;
  rowsPerStrip: number;
  stripBuf: Buffer;
  stripRows = 0;
  offsets: number[] = [];
  counts: number[] = [];
  rowsWritten = 0;
  path: string;
  bytesWritten = 0;

  constructor(path: string, opts: TiffWriterOpts) {
    this.path = path;
    this.o = {
      bigtiff: false,
      compression: "deflate",
      level: 1,
      targetStripBytes: 1024 * 1024,
      ...opts,
      icc: opts.icc ?? null,
      xRes: opts.xRes ?? 72,
      yRes: opts.yRes ?? opts.xRes ?? 72,
    } as any;
    this.rowBytes = opts.width * opts.samples;
    this.rowsPerStrip = Math.max(1, Math.min(opts.height, Math.floor(this.o.targetStripBytes / this.rowBytes)));
    this.stripBuf = Buffer.allocUnsafe(this.rowsPerStrip * this.rowBytes);
    this.fd = fs.openSync(path, "w");
    this.pos = this.o.bigtiff ? 16 : 8;
    fs.writeSync(this.fd, Buffer.alloc(this.pos), 0, this.pos, 0); // başlık sonra yazılır
  }

  async writeRow(row: Buffer) {
    row.copy(this.stripBuf, this.stripRows * this.rowBytes, 0, this.rowBytes);
    this.stripRows++;
    this.rowsWritten++;
    if (this.stripRows === this.rowsPerStrip || this.rowsWritten === this.o.height) await this.flushStrip();
  }

  private async flushStrip() {
    const raw = this.stripBuf.subarray(0, this.stripRows * this.rowBytes);
    const data = this.o.compression === "deflate" ? await deflate(raw, { level: this.o.level }) : Buffer.from(raw);
    fs.writeSync(this.fd, data, 0, data.length, this.pos);
    this.offsets.push(this.pos);
    this.counts.push(data.length);
    this.pos += data.length;
    this.bytesWritten += data.length;
    if (this.pos % 2) {
      fs.writeSync(this.fd, Buffer.alloc(1), 0, 1, this.pos);
      this.pos++;
    }
    this.stripRows = 0;
  }

  async close() {
    if (this.rowsWritten !== this.o.height) throw new Error(`TIFF eksik satır: ${this.rowsWritten}/${this.o.height}`);
    const big = this.o.bigtiff;
    if (!big && this.pos > 0xfff00000) throw new Error("Klasik TIFF 4GB sınırını aştı; bigtiff kullanılmalı");
    const entries: { tag: number; type: number; count: number; data: Buffer }[] = [];
    const u16 = (vals: number[]) => {
      const b = Buffer.alloc(vals.length * 2);
      vals.forEach((v, i) => b.writeUInt16LE(v, i * 2));
      return b;
    };
    const u32 = (vals: number[]) => {
      const b = Buffer.alloc(vals.length * 4);
      vals.forEach((v, i) => b.writeUInt32LE(v, i * 4));
      return b;
    };
    const u64 = (vals: number[]) => {
      const b = Buffer.alloc(vals.length * 8);
      vals.forEach((v, i) => b.writeBigUInt64LE(BigInt(v), i * 8));
      return b;
    };
    const rational = (v: number) => u32([Math.round(v * 10000), 10000]);
    const add = (tag: number, type: number, count: number, data: Buffer) => entries.push({ tag, type, count, data });
    const { width, height, samples, photometric } = this.o;
    add(256, T.LONG, 1, u32([width]));
    add(257, T.LONG, 1, u32([height]));
    add(258, T.SHORT, samples, u16(Array(samples).fill(8)));
    add(259, T.SHORT, 1, u16([this.o.compression === "deflate" ? 8 : 1]));
    add(262, T.SHORT, 1, u16([photometric]));
    const n = this.offsets.length;
    if (big) add(273, T.LONG8, n, u64(this.offsets));
    else add(273, T.LONG, n, u32(this.offsets));
    add(277, T.SHORT, 1, u16([samples]));
    add(278, T.LONG, 1, u32([this.rowsPerStrip]));
    if (big) add(279, T.LONG8, n, u64(this.counts));
    else add(279, T.LONG, n, u32(this.counts));
    add(282, T.RATIONAL, 1, rational(this.o.xRes));
    add(283, T.RATIONAL, 1, rational(this.o.yRes));
    add(284, T.SHORT, 1, u16([1]));
    add(296, T.SHORT, 1, u16([2]));
    const sw = Buffer.from("DKM Takip DEMO motoru\0", "latin1");
    add(305, T.ASCII, sw.length, sw);
    if (photometric === 5) add(332, T.SHORT, 1, u16([1]));
    if (this.o.icc && this.o.icc.length) add(34675, T.UNDEFINED, this.o.icc.length, this.o.icc);
    entries.sort((a, b) => a.tag - b.tag);

    const inlineMax = big ? 8 : 4;
    const entrySize = big ? 20 : 12;
    const ifdStart = this.pos;
    const ifdLen = (big ? 8 : 2) + entries.length * entrySize + (big ? 8 : 4);
    let dataPos = ifdStart + ifdLen;
    if (dataPos % 2) dataPos++;
    const ifd = Buffer.alloc(ifdLen);
    let p = 0;
    if (big) {
      ifd.writeBigUInt64LE(BigInt(entries.length), 0);
      p = 8;
    } else {
      ifd.writeUInt16LE(entries.length, 0);
      p = 2;
    }
    const extra: Buffer[] = [];
    let extraPos = dataPos;
    for (const e of entries) {
      ifd.writeUInt16LE(e.tag, p);
      ifd.writeUInt16LE(e.type, p + 2);
      if (big) ifd.writeBigUInt64LE(BigInt(e.count), p + 4);
      else ifd.writeUInt32LE(e.count, p + 4);
      const vOff = p + (big ? 12 : 8);
      if (e.data.length <= inlineMax) {
        e.data.copy(ifd, vOff);
      } else {
        if (big) ifd.writeBigUInt64LE(BigInt(extraPos), vOff);
        else ifd.writeUInt32LE(extraPos, vOff);
        let d = e.data;
        if (d.length % 2) d = Buffer.concat([d, Buffer.alloc(1)]);
        extra.push(d);
        extraPos += d.length;
      }
      p += entrySize;
    }
    // next IFD = 0 (zaten sıfır)
    fs.writeSync(this.fd, ifd, 0, ifd.length, ifdStart);
    let wp = dataPos;
    for (const d of extra) {
      fs.writeSync(this.fd, d, 0, d.length, wp);
      wp += d.length;
    }
    const hdr = Buffer.alloc(big ? 16 : 8);
    hdr.write("II", 0, "latin1");
    if (big) {
      hdr.writeUInt16LE(43, 2);
      hdr.writeUInt16LE(8, 4);
      hdr.writeUInt16LE(0, 6);
      hdr.writeBigUInt64LE(BigInt(ifdStart), 8);
    } else {
      hdr.writeUInt16LE(42, 2);
      hdr.writeUInt32LE(ifdStart, 4);
    }
    fs.writeSync(this.fd, hdr, 0, hdr.length, 0);
    fs.fsyncSync(this.fd);
    fs.closeSync(this.fd);
    this.bytesWritten = wp;
  }

  abort() {
    try {
      fs.closeSync(this.fd);
    } catch {}
    try {
      fs.unlinkSync(this.path);
    } catch {}
  }
}
