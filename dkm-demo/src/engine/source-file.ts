// Kaynak (tasarım) dosyası okuyucu.
// - Dosyalar YALNIZCA salt-okunur ('r') modda açılır; tasarım arşivine asla yazılmaz.
// - Okunan bayt sayısı ölçülür (ağ trafiği / disk okuma raporu için).
// - Test modunda sunucu bağlantı kopması simüle edilebilir (DKM_FAULT).

import fs from "node:fs";
import { EngineError } from "./errors.ts";

export const ioStats = { sourceBytesRead: 0 };

function faultSpec(): { disconnectAfterBytes?: number } {
  // Yalnızca demo test modunda etkin. Canlı entegrasyonda bu kod bulunmayacak.
  if (process.env.DKM_DEMO_TEST_MODE !== "1") return {};
  const f = process.env.DKM_FAULT || "";
  const m = f.match(/source_disconnect_after_bytes=(\d+)/);
  return m ? { disconnectAfterBytes: Number(m[1]) } : {};
}

export class SourceFile {
  path: string;
  size = 0;
  private fh: fs.promises.FileHandle | null = null;
  bytesRead = 0;
  private fault = faultSpec();

  constructor(p: string) {
    this.path = p;
  }

  async open() {
    try {
      this.fh = await fs.promises.open(this.path, "r"); // salt okunur
      const st = await this.fh.stat();
      this.size = st.size;
    } catch (e: any) {
      throw new EngineError("SOURCE_UNAVAILABLE", `Kaynak dosya açılamadı (${e.code || ""}): ${this.path}`);
    }
    return this;
  }

  async read(buf: Buffer, offset: number, length: number, position: number): Promise<number> {
    if (!this.fh) throw new Error("SourceFile not open");
    if (this.fault.disconnectAfterBytes !== undefined && this.bytesRead + length > this.fault.disconnectAfterBytes) {
      throw new EngineError("SOURCE_UNAVAILABLE", "Simüle edilmiş sunucu bağlantı kopması (EIO) [test]");
    }
    let r;
    try {
      r = await this.fh.read(buf, offset, length, position);
    } catch (e: any) {
      throw new EngineError("SOURCE_UNAVAILABLE", `Kaynak okuma hatası (${e.code || e.message})`);
    }
    this.bytesRead += r.bytesRead;
    ioStats.sourceBytesRead += r.bytesRead;
    return r.bytesRead;
  }

  async readExact(length: number, position: number): Promise<Buffer> {
    const b = Buffer.allocUnsafe(length);
    let got = 0;
    while (got < length) {
      const n = await this.read(b, got, length - got, position + got);
      if (n === 0) throw new EngineError("CORRUPT_FILE", `Dosya beklenenden kısa (pozisyon ${position + got}, dosya boyutu ${this.size})`);
      got += n;
    }
    return b;
  }

  async close() {
    if (this.fh) await this.fh.close().catch(() => {});
    this.fh = null;
  }
}
