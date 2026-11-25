import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/prisma";
import {
  createTestWhatsAppForDraft,
  generateDraftForOrder,
  generatePrintReadyForDraft,
  getDemoDb,
} from "@/lib/demo-engine";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const orderIdParam = searchParams.get("orderId");
  const ddb = getDemoDb();

  if (orderIdParam) {
    const orderId = Number(orderIdParam);
    const drafts = await ddb.draftRecord.findMany({
      where: { orderId },
      orderBy: { version: "desc" },
    });
    const whatsappLogs = await ddb.whatsappTestLog.findMany({
      where: { orderId },
      orderBy: { id: "desc" },
    });
    return NextResponse.json({ ok: true, drafts, whatsappLogs });
  }

  // Tüm siparişler için en son taslak özeti (Kanban kartlarında göstermek için)
  const allDrafts = (await ddb.draftRecord.findMany({
    orderBy: [{ orderId: "asc" }, { version: "desc" }],
  })) as any[];
  const byOrder: Record<number, any> = {};
  for (const dr of allDrafts) {
    if (!byOrder[dr.orderId]) byOrder[dr.orderId] = dr;
  }
  return NextResponse.json({ ok: true, draftsByOrder: byOrder });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "generate");
  const orderId = Number(body.orderId);
  if (!orderId) return NextResponse.json({ error: "orderId zorunludur" }, { status: 400 });

  const origin = new URL(request.url).origin;
  const actor = session.user.name || session.user.username || "Demo Kullanıcı";

  try {
    if (action === "generate") {
      const res = await generateDraftForOrder(orderId, {
        actor,
        publicBaseUrl: origin,
        autoSendWhatsApp: !!body.autoSendWhatsApp,
        overrideSku: body.overrideSku,
        overrideDimensions: body.overrideDimensions,
        overrideSourcePath: body.overrideSourcePath,
        rememberSkuMapping: !!body.rememberSkuMapping,
        forceDrive: !!body.forceDrive,
        layoutMode: body.layoutMode,
        tileConfig: body.tileConfig,
      });
      return NextResponse.json(res, { status: res.ok ? 200 : 422 });
    }

    if (action === "crop") {
      const res = await generateDraftForOrder(orderId, {
        actor,
        publicBaseUrl: origin,
        crop: body.crop,
        detailCenter: body.detailCenter,
        autoSendWhatsApp: !!body.sendWhatsApp,
        overrideSku: body.overrideSku,
        overrideDimensions: body.overrideDimensions,
        layoutMode: body.layoutMode,
        tileConfig: body.tileConfig,
      });
      return NextResponse.json(res, { status: res.ok ? 200 : 422 });
    }

    if (action === "whatsapp") {
      const ddb = getDemoDb();
      const draftId = Number(body.draftId) || (await ddb.draftRecord.findFirst({ where: { orderId }, orderBy: { version: "desc" } }))?.id;
      if (!draftId) return NextResponse.json({ error: "Önce otomatik taslak oluşturun." }, { status: 400 });
      const log = await createTestWhatsAppForDraft(orderId, draftId, origin, actor);
      return NextResponse.json({ ok: true, whatsappLog: log });
    }

    if (action === "print") {
      const ddb = getDemoDb();
      const draftId = Number(body.draftId) || (await ddb.draftRecord.findFirst({ where: { orderId }, orderBy: { version: "desc" } }))?.id;
      if (!draftId) return NextResponse.json({ error: "Onaylı taslak bulunamadı." }, { status: 409 });
      const updated = await generatePrintReadyForDraft(orderId, draftId, actor);
      return NextResponse.json({ ok: true, draft: updated });
    }

    return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
  } catch (e: any) {
    const status = e?.code === "NOT_APPROVED" || e?.code === "STALE_VERSION" ? 409 : 400;
    return NextResponse.json({ ok: false, code: e?.code || "ERROR", error: e?.message || "İşlem hatası" }, { status });
  }
}
