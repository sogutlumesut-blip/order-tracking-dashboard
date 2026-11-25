import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/prisma";
import { getDemoDb, saveSkuMapping } from "@/lib/demo-engine";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
  const ddb = getDemoDb();
  const mappings = await ddb.skuMapping.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ ok: true, mappings });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  try {
    const saved = await saveSkuMapping(String(body.sku || ""), String(body.filePath || ""), String(body.matchedBy || "visual_match"));
    return NextResponse.json({ ok: true, mapping: saved });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Eşleştirme kaydedilemedi" }, { status: 400 });
  }
}
