import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/prisma";
import { generatePrintReadyForDraft, getDemoDb } from "@/lib/demo-engine";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "approve");

  const ddb = getDemoDb();
  const draft = await ddb.draftRecord.findUnique({ where: { approvalToken: token } });
  if (!draft) return NextResponse.json({ error: "Onay bağlantısı bulunamadı." }, { status: 404 });

  const order = await ddb.order.findUnique({ where: { id: draft.orderId } });
  if (!order) return NextResponse.json({ error: "Sipariş bulunamadı." }, { status: 404 });

  const latest = await ddb.draftRecord.findFirst({ where: { orderId: order.id }, orderBy: { version: "desc" } });
  if (!latest || latest.id !== draft.id || draft.status === "superseded") {
    return NextResponse.json(
      { code: "STALE_VERSION", error: `Bu bağlantı eski taslak sürümüne (v${draft.version}) aittir. Güncel sürüm v${latest?.version || draft.version}.` },
      { status: 409 },
    );
  }

  const cols = (await ddb.statusColumn.findMany()) as { id: string; title: string }[];

  if (action === "revision") {
    const note = String(body.note || "").trim();
    if (!note) return NextResponse.json({ error: "Lütfen revizyon açıklamasını yazın." }, { status: 400 });
    if (draft.status === "approved") return NextResponse.json({ error: "Onaylı taslak için revizyon istenemez." }, { status: 409 });

    const draftCol = cols.find((c) => c.id === "draft" || /taslak/i.test(c.title))?.id || "draft";
    await ddb.draftRecord.update({ where: { id: draft.id }, data: { status: "revision_requested", revisionNote: note } });
    await ddb.order.update({ where: { id: order.id }, data: { status: draftCol, updatedAt: new Date() } });
    await ddb.orderActivity.create({
      data: {
        orderId: order.id,
        author: `Müşteri (${order.customer})`,
        action: "REVISION_REQUESTED",
        details: `Taslak v${draft.version} revizyon talebi: "${note}". Sipariş 'Taslak' sütununa alındı.`,
      },
    });
    return NextResponse.json({ ok: true, status: "revision_requested" });
  }

  // Approve
  if (draft.ppiStatus === "low" || draft.status === "failed") {
    return NextResponse.json({ code: "LOW_RESOLUTION", error: "Yetersiz çözünürlüklü taslak onaylanamaz." }, { status: 409 });
  }

  const approver = String(body.customerName || order.customer).trim();
  const approvedCol = cols.find((c) => c.id === "Approved" || /^onaylandı$/i.test(c.title))?.id || "Approved";

  await ddb.draftRecord.update({
    where: { id: draft.id },
    data: { status: "approved", approvedAt: new Date(), approvedByName: approver },
  });
  await ddb.order.update({ where: { id: order.id }, data: { status: approvedCol, updatedAt: new Date() } });
  await ddb.orderActivity.create({
    data: {
      orderId: order.id,
      author: `Müşteri (${approver})`,
      action: "DRAFT_APPROVED",
      details: `Taslak v${draft.version} müşteri tarafından onaylandı. Sipariş 'Onaylandı' sütununa taşındı.`,
    },
  });

  // Onaylanan yüksek çözünürlüklü baskı dosyasını test klasörüne kaydet (DKM_DEMO/PRINT_READY)
  let printResult: any = null;
  let printError: string | null = null;
  try {
    printResult = await generatePrintReadyForDraft(order.id, draft.id, `Müşteri Onayı (${approver})`);
  } catch (e: any) {
    printError = e?.message || "Baskı dosyası oluşturulamadı";
  }

  return NextResponse.json({
    ok: true,
    orderStatus: approvedCol,
    draftVersion: draft.version,
    printReadyPath: printResult?.printReadyPath || null,
    printReadyBytes: printResult?.printReadyBytes || null,
    printError,
  });
}
