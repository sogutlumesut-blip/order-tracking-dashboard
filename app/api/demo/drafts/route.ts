import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/prisma";
import {
  createTestWhatsAppForDraft,
  generateDraftForOrder,
  generatePrintReadyForDraft,
  getDemoDb,
} from "@/lib/demo-engine";
import { dispatchToOfficeAgent, getOfficeAgentStatus } from "@/lib/office-agent-bridge";
import { findCustomDesignUrl } from "@/dkm-demo/src/engine/drive-fetch.ts";
import { getPublicOrigin } from "@/lib/google-drive-auth";

function stripBlobs(dr: any) {
  if (!dr) return dr;
  const { previewData, detailData, proxyData, ...rest } = dr;
  return {
    ...rest,
    previewPath: dr.previewPath || (previewData ? "db:preview" : null),
    detailPath: dr.detailPath || (detailData ? "db:detail" : null),
    proxyPath: dr.proxyPath || (proxyData ? "db:proxy" : null),
  };
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const orderIdParam = searchParams.get("orderId");
  const ddb = getDemoDb();

  if (orderIdParam) {
    const orderId = Number(orderIdParam);
    const drafts = (await ddb.draftRecord.findMany({
      where: { orderId },
      orderBy: { version: "desc" },
    })).map(stripBlobs);
    const whatsappLogs = await ddb.whatsappTestLog.findMany({
      where: { orderId },
      orderBy: { id: "desc" },
    });
    return NextResponse.json({ ok: true, drafts, whatsappLogs });
  }

  // Tüm siparişler için en son taslak özeti (Kanban kartlarında göstermek için - ağır blob alanları çekilmez)
  const allDrafts = (await ddb.draftRecord.findMany({
    orderBy: [{ orderId: "asc" }, { version: "desc" }],
    select: {
      id: true,
      orderId: true,
      version: true,
      sku: true,
      effectivePpi: true,
      ppiStatus: true,
      status: true,
      approvalToken: true,
      previewPath: true,
      printReadyPath: true,
      errorCode: true,
      errorMessage: true,
      layoutMode: true,
    },
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

  const origin = getPublicOrigin(request);
  const actor = session.user.name || session.user.username || "Kullanıcı";

  try {
    const agent = await getOfficeAgentStatus();

    if (action === "generate" || action === "crop") {
      // Ofis Ajanı çevrimiçiyse (büyük RAM + disk) ağır Google Drive dosyalarını da Ofis Ajanı işlesin;
      // Ofis Ajanı çevrimdışıysa bulutta akışlı (streaming) indirip işlesin!
      if (agent.online && !isDemoMode()) {
        const res = await dispatchToOfficeAgent(
          "generate_draft",
          {
            actor,
            crop: action === "crop" ? body.crop : undefined,
            detailCenter: body.detailCenter,
            autoSendWhatsApp: !!(body.autoSendWhatsApp || body.sendWhatsApp),
            overrideSku: body.overrideSku,
            overrideDimensions: body.overrideDimensions,
            overrideSourcePath: body.overrideSourcePath,
            overrideUrl: body.overrideUrl,
            rememberSkuMapping: !!body.rememberSkuMapping,
            forceDrive: !!body.forceDrive,
            layoutMode: body.layoutMode,
            tileConfig: body.tileConfig,
          },
          { orderId, timeoutMs: 90_000 },
        );
        return NextResponse.json(res, { status: res.ok ? 200 : 422 });
      }
      const res = await generateDraftForOrder(orderId, {
        actor,
        publicBaseUrl: origin,
        crop: action === "crop" ? body.crop : undefined,
        detailCenter: body.detailCenter,
        autoSendWhatsApp: !!(body.autoSendWhatsApp || body.sendWhatsApp),
        overrideSku: body.overrideSku,
        overrideDimensions: body.overrideDimensions,
        overrideSourcePath: body.overrideSourcePath,
        overrideUrl: body.overrideUrl,
        rememberSkuMapping: !!body.rememberSkuMapping,
        forceDrive: !!body.forceDrive,
        layoutMode: body.layoutMode,
        tileConfig: body.tileConfig,
      });
      return NextResponse.json(
        res.draft ? { ...res, draft: stripBlobs(res.draft) } : res,
        { status: res.ok ? 200 : 422 },
      );
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
      const dr = await ddb.draftRecord.findUnique({ where: { id: draftId } });
      if (!dr || dr.status !== "approved") {
        return NextResponse.json({ ok: false, code: "NOT_APPROVED", error: "Onaysız taslak için baskı dosyası üretilemez!" }, { status: 409 });
      }
      if (agent.online && !isDemoMode()) {
        const res = await dispatchToOfficeAgent(
          "generate_print",
          {
            draftId,
            actor,
            targetDir: body.targetDir ? String(body.targetDir).trim() : undefined,
            forceRegenerate: !!body.forceRegenerate,
          },
          { orderId, timeoutMs: 55_000 },
        );
        return NextResponse.json(res);
      }
      const updated = await generatePrintReadyForDraft(orderId, draftId, actor);
      return NextResponse.json({ ok: true, draft: stripBlobs(updated) });
    }

    return NextResponse.json({ error: "Geçersiz işlem" }, { status: 400 });
  } catch (e: any) {
    const status = e?.code === "NOT_APPROVED" || e?.code === "STALE_VERSION" ? 409 : 400;
    return NextResponse.json({ ok: false, code: e?.code || "ERROR", error: e?.message || "İşlem hatası" }, { status });
  }
}
