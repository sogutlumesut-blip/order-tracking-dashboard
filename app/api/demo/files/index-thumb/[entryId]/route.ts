import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/prisma";
import { getDemoDb, getDemoPaths } from "@/lib/demo-engine";

export async function GET(_request: Request, context: { params: Promise<{ entryId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });

  const { entryId } = await context.params;
  const id = Number(entryId);
  if (!id) return NextResponse.json({ error: "Geçersiz id" }, { status: 400 });

  const ddb = getDemoDb();
  const entry = await ddb.designIndexEntry.findUnique({ where: { id } });
  if (!entry || !fs.existsSync(entry.filePath)) {
    return NextResponse.json({ error: "Dosya bulunamadı" }, { status: 404 });
  }

  const paths = await getDemoPaths();
  const thumbDir = path.join(paths.cache, "thumbs");
  await fs.promises.mkdir(thumbDir, { recursive: true });
  const thumbPath = path.join(thumbDir, `idx_${entry.id}_${Math.round(entry.mtimeMs || 0)}.jpg`);

  if (!fs.existsSync(thumbPath)) {
    try {
      await sharp(entry.filePath, { limitInputPixels: false, failOn: "none" })
        .resize(260, 260, { fit: "inside" })
        .flatten({ background: "#ffffff" })
        .toColourspace("srgb")
        .jpeg({ quality: 78 })
        .toFile(thumbPath);
    } catch {
      return NextResponse.json({ error: "Önizleme üretilemedi" }, { status: 422 });
    }
  }

  const buf = await fs.promises.readFile(thumbPath);
  return new NextResponse(buf, { status: 200, headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600" } });
}
