import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/prisma";
import { getDemoDb } from "@/lib/demo-engine";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });

  const ddb = getDemoDb();
  const logs = await ddb.whatsappTestLog.findMany({
    orderBy: { id: "desc" },
    take: 100,
    include: { order: { select: { id: true, barcode: true, customer: true, status: true } } },
  });
  return NextResponse.json({ ok: true, logs });
}
