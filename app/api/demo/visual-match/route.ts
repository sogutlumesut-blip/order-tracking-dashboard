import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/prisma";
import { findVisualMatchesForOrder } from "@/lib/demo-engine";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const orderId = Number(body.orderId);
  if (!orderId) return NextResponse.json({ error: "orderId zorunludur" }, { status: 400 });

  try {
    const res = await findVisualMatchesForOrder(orderId, Number(body.limit || 6));
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Görsel eşleştirme hatası", matches: [] }, { status: 400 });
  }
}
