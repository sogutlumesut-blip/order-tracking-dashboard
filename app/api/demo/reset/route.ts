import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/prisma";
import { getDemoDb, resetDemoOutputsOnly } from "@/lib/demo-engine";

export async function POST(request: Request) {
  if (!isDemoMode()) return NextResponse.json({ error: "Yalnızca DEMO MODE'da aktiftir" }, { status: 403 });
  const session = await getSession();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Bu işlem yalnızca yönetici yetkisi gerektirir." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "reset");
  const ddb = getDemoDb();

  if (action === "reset") {
    const res = await resetDemoOutputsOnly();
    return NextResponse.json(res);
  }

  if (action === "live_approve") {
    const note = String(body.note || "").trim();
    if (!note) return NextResponse.json({ error: "Yönetici onay notu zorunludur." }, { status: 400 });
    const now = new Date().toISOString();
    const pairs: [string, string][] = [
      ["demo_live_promotion_status", "approved_for_merge"],
      ["demo_live_promotion_note", note],
      ["demo_live_promotion_by", session.user.name || "admin"],
      ["demo_live_promotion_at", now],
    ];
    for (const [key, value] of pairs) {
      await ddb.systemSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
    }
    return NextResponse.json({
      ok: true,
      status: "approved_for_merge",
      message: "Canlı geçiş yönetici onayı kaydedildi (otomatik canlı deploy yapılmaz; main branch merge onayla yapılır).",
    });
  }

  if (action === "live_lock") {
    await ddb.systemSetting.upsert({
      where: { key: "demo_live_promotion_status" },
      update: { value: "locked" },
      create: { key: "demo_live_promotion_status", value: "locked" },
    });
    return NextResponse.json({ ok: true, status: "locked" });
  }

  return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
}
