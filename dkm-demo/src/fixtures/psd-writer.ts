// TEST AMAÇLI PSD/PSB yazıcı – yalnızca demo test dosyaları üretmek için.
// Motorun PSD okuyucusundan bağımsız olarak Adobe spesifikasyonuna göre yazılmıştır.
// Ayrıca macOS üzerinde Apple ImageIO (sips) ile üretilen PSD'ler bağımsız doğrulama için kullanılır.

import fs from "node:fs";

export interface PsdWriteOpts {
  version: 1 | 2;
  width: number;
  height: number;
  colorMode: 1 | 3 | 4 | 9; // 9 = Lab (desteklenmeyen mod testi)
  depth: 8 | 16;
  compression: 0 | 1;
  extraAlpha?: boolean;
  ppi?: number;
  icc?: Buffer | null;
  hasRealMergedData?: boolean | null; // null => VersionInfo kaynağı yazılmaz
  fakeLayerBytes?: number; // katman bölümü yerine atlanması gereken veri
  // satır üreteci: y satırı için RGB (3*width) 8-bit veri döndürür
  rgbRow: (y: number, out: Buffer) => void;
}

function packBits(src: Buffer): Buffer {
  const out: number[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    // tekrar dizisi ara
    let run = 1;
    while (i + run < n && run < 128 && src[i + run] === src[i]) run++;
    if (run >= 3) {
      out.push(257 - run, src[i]);
      i += run;
      continue;
    }
    // literal dizi
    const start = i;
    let lit = 0;
    while (i < n && lit < 128) {
      let r = 1;
      while (i + r < n && r < 3 && src[i + r] === src[i]) r++;
      if (r >= 3) break;
      i++;
      lit++;
    }
    out.push(lit - 1);
    for (let k = start; k < start + lit; k++) out.push(src[k]);
  }
  return Buffer.from(out);
}

function channelCount(o: PsdWriteOpts) {
  const base = o.colorMode === 1 ? 1 : o.colorMode === 4 ? 4 : 3;
  return base + (o.extraAlpha ? 1 : 0);
}

// RGB satırından c kanalının PSD değerlerini üretir (8-bit)
function channelFromRgb(o: PsdWriteOpts, rgb: Buffer, c: number, w: number, out: Buffer, y: number) {
  const nBase = o.colorMode === 1 ? 1 : o.colorMode === 4 ? 4 : 3;
  for (let x = 0; x < w; x++) {
    const r = rgb[x * 3],
      g = rgb[x * 3 + 1],
      b = rgb[x * 3 + 2];
    let v: number;
    if (c >= nBase) v = ((x + y) >> 4) % 2 ? 255 : 200; // alfa kanalı (görmezden gelinmeli)
    else if (o.colorMode === 1) v = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    else if (o.colorMode === 4) {
      const C = 255 - r,
        M = 255 - g,
        Y = 255 - b;
      const K = Math.min(C, M, Y);
      const ink = c === 0 ? C - K : c === 1 ? M - K : c === 2 ? Y - K : K;
      v = 255 - ink; // PSD CMYK ters saklanır
    } else if (o.colorMode === 9) v = c === 0 ? Math.round((r / 255) * 255) : 128;
    else v = c === 0 ? r : c === 1 ? g : b;
    out[x] = v;
  }
}

export async function writePsd(file: string, o: PsdWriteOpts) {
  const ch = channelCount(o);
  const w = o.width,
    h = o.height;
  const bpc = o.depth / 8;
  const fd = fs.openSync(file, "w");
  let pos = 0;
  const write = (b: Buffer) => {
    fs.writeSync(fd, b, 0, b.length, pos);
    pos += b.length;
  };
  const hdr = Buffer.alloc(26);
  hdr.write("8BPS", 0, "latin1");
  hdr.writeUInt16BE(o.version, 4);
  hdr.writeUInt16BE(ch, 12);
  hdr.writeUInt32BE(h, 14);
  hdr.writeUInt32BE(w, 18);
  hdr.writeUInt16BE(o.depth, 22);
  hdr.writeUInt16BE(o.colorMode, 24);
  write(hdr);
  write(Buffer.alloc(4)); // color mode data len = 0

  // image resources
  const res: Buffer[] = [];
  const resBlock = (id: number, data: Buffer) => {
    const b = Buffer.alloc(4 + 2 + 2 + 4);
    b.write("8BIM", 0, "latin1");
    b.writeUInt16BE(id, 4);
    b.writeUInt16BE(0, 6); // boş pascal adı (2 bayt)
    b.writeUInt32BE(data.length, 8);
    res.push(b, data);
    if (data.length % 2) res.push(Buffer.alloc(1));
  };
  if (o.ppi) {
    const d = Buffer.alloc(16);
    d.writeUInt32BE(Math.round(o.ppi * 65536), 0);
    d.writeUInt16BE(1, 4);
    d.writeUInt16BE(1, 6);
    d.writeUInt32BE(Math.round(o.ppi * 65536), 8);
    d.writeUInt16BE(1, 12);
    d.writeUInt16BE(1, 14);
    resBlock(0x03ed, d);
  }
  if (o.icc) resBlock(0x040f, o.icc);
  if (o.hasRealMergedData !== null && o.hasRealMergedData !== undefined) {
    const d = Buffer.alloc(13);
    d.writeUInt32BE(1, 0);
    d[4] = o.hasRealMergedData ? 1 : 0;
    resBlock(0x0421, d);
  }
  const resBuf = Buffer.concat(res);
  const irl = Buffer.alloc(4);
  irl.writeUInt32BE(resBuf.length, 0);
  write(irl);
  write(resBuf);

  // layer & mask: sahte veri (okuyucu uzunluğa göre atlamalı)
  const fake = o.fakeLayerBytes || 0;
  const lb = Buffer.alloc(o.version === 1 ? 4 : 8);
  if (o.version === 1) lb.writeUInt32BE(fake, 0);
  else lb.writeBigUInt64BE(BigInt(fake), 0);
  write(lb);
  if (fake) {
    const junk = Buffer.alloc(fake);
    for (let i = 0; i < fake; i++) junk[i] = (i * 31 + 7) & 255;
    write(junk);
  }
  const cb = Buffer.alloc(2);
  cb.writeUInt16BE(o.compression, 0);
  write(cb);

  const rgb = Buffer.alloc(w * 3);
  const plane = Buffer.alloc(w);
  const plane16 = Buffer.alloc(w * 2);
  const toDepth = (p: Buffer) => {
    if (bpc === 1) return p;
    for (let x = 0; x < w; x++) plane16.writeUInt16BE(p[x] * 257, x * 2);
    return plane16;
  };

  if (o.compression === 0) {
    for (let c = 0; c < ch; c++) {
      // büyük yazımlarda satırları toplu yaz
      const batchRows = Math.max(1, Math.floor((8 * 1024 * 1024) / (w * bpc)));
      let batch: Buffer[] = [];
      for (let y = 0; y < h; y++) {
        o.rgbRow(y, rgb);
        channelFromRgb(o, rgb, c, w, plane, y);
        batch.push(Buffer.from(toDepth(plane)));
        if (batch.length >= batchRows) {
          write(Buffer.concat(batch));
          batch = [];
        }
      }
      if (batch.length) write(Buffer.concat(batch));
    }
  } else {
    const entry = o.version === 1 ? 2 : 4;
    const tablePos = pos;
    const table = Buffer.alloc(ch * h * entry);
    write(table); // yer tutucu
    let i = 0;
    for (let c = 0; c < ch; c++) {
      let batch: Buffer[] = [];
      let batchLen = 0;
      for (let y = 0; y < h; y++) {
        o.rgbRow(y, rgb);
        channelFromRgb(o, rgb, c, w, plane, y);
        const pk = packBits(toDepth(plane));
        if (entry === 2) table.writeUInt16BE(pk.length, i * 2);
        else table.writeUInt32BE(pk.length, i * 4);
        i++;
        batch.push(pk);
        batchLen += pk.length;
        if (batchLen > 8 * 1024 * 1024) {
          write(Buffer.concat(batch));
          batch = [];
          batchLen = 0;
        }
      }
      if (batch.length) write(Buffer.concat(batch));
    }
    fs.writeSync(fd, table, 0, table.length, tablePos);
  }
  fs.closeSync(fd);
  return { bytes: pos, channels: ch };
}
