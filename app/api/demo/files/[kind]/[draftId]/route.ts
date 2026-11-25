import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/prisma";
import { getDemoDb } from "@/lib/demo-engine";

export async function GET(request: Request, context: { params: Promise<{ kind: string; draftId: string }> }) {
  const { kind, draftId } = await context.params;
  const id = Number(draftId);
  if (!id) return NextResponse.json({ error: "Geçersiz draftId" }, { status: 400 });

  const ddb = getDemoDb();
  const draft = await ddb.draftRecord.findUnique({ where: { id } });
  if (!draft) return NextResponse.json({ error: "Taslak bulunamadı" }, { status: 404 });

  const token = new URL(request.url).searchParams.get("token");
  const tokenOk = !!token && token === draft.approvalToken && (kind === "preview" || kind === "detail");
  if (!tokenOk) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
  }

  let filePath: string | null = null;
  let contentType = "image/jpeg";
  let downloadName: string | undefined;

  if (kind === "preview") filePath = draft.previewPath;
  else if (kind === "detail") filePath = draft.detailPath;
  else if (kind === "proxy") filePath = draft.proxyPath;
  else if (kind === "print") {
    if (draft.status !== "approved" || !draft.printReadyPath) {
      return NextResponse.json({ error: "Onaylı baskı dosyası henüz oluşturulmadı." }, { status: 409 });
    }
    filePath = draft.printReadyPath;
    contentType = "image/tiff";
    downloadName = path.basename(draft.printReadyPath);
  }

  if (!filePath || !fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Dosya diskte bulunamadı" }, { status: 404 });
  }

  const buf = await fs.promises.readFile(filePath);
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-DKM-Mode": "DEMO",
  };
  if (downloadName) headers["Content-Disposition"] = `attachment; filename="${downloadName}"`;
  return new NextResponse(buf, { status: 200, headers });
}
