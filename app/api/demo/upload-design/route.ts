import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { generateDraftForOrder, getDemoPaths } from "@/lib/demo-engine";
import { getPublicOrigin } from "@/lib/google-drive-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stripBlobs(d: any) {
  if (!d) return d;
  const { previewData: _p, detailData: _d, proxyData: _x, ...rest } = d;
  return rest;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });

  const url = new URL(request.url);
  const orderId = Number(url.searchParams.get("orderId") || 0);
  if (!orderId) return NextResponse.json({ error: "orderId zorunludur" }, { status: 400 });

  const rawName = url.searchParams.get("filename") || "upload.tif";
  const safeName = path.basename(rawName).replace(/[^A-Za-z0-9._-]/g, "_") || "upload.tif";
  const overrideSku = url.searchParams.get("sku") || undefined;
  const overrideDimensions = url.searchParams.get("dim") || undefined;

  if (!request.body) {
    return NextResponse.json({ error: "Dosya içeriği boş" }, { status: 400 });
  }

  const paths = await getDemoPaths();
  const uploadDir = path.join(paths.cache, "uploads");
  await fs.promises.mkdir(uploadDir, { recursive: true });
  const destPath = path.join(uploadDir, `${orderId}_${Date.now()}_${safeName}`);

  try {
    // Akışlı (streaming) yazma — büyük TIFF/PSD dosyalarında RAM şişmesini önler
    const ws = fs.createWriteStream(destPath);
    await pipeline(Readable.fromWeb(request.body as any), ws);
    const st = await fs.promises.stat(destPath);
    if (st.size < 32) {
      await fs.promises.rm(destPath, { force: true });
      return NextResponse.json({ ok: false, error: "Yüklenen dosya boş veya geçersiz." }, { status: 400 });
    }

    const origin = getPublicOrigin(request);
    const actor = session.user.name || session.user.username || "Kullanıcı";
    const res = await generateDraftForOrder(orderId, {
      actor,
      publicBaseUrl: origin,
      overrideSku,
      overrideDimensions,
      overrideSourcePath: destPath,
    });

    return NextResponse.json(
      res.draft ? { ...res, draft: stripBlobs(res.draft) } : res,
      { status: res.ok ? 200 : 422 },
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, code: e?.code || "UPLOAD_ERROR", error: e?.message || "Dosya yükleme/işleme hatası" },
      { status: 400 },
    );
  }
}
