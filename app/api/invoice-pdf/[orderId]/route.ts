import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/prisma";
import { fetchEdmInvoicePdfBuffer, createEdmInvoiceDirect } from "@/lib/edm-api";

export const dynamic = "force-dynamic";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ orderId: string }> }
) {
    const session = await getSession();
    if (!session) {
        return new NextResponse("Oturum kapalı", { status: 401 });
    }

    const resolvedParams = await params;
    const orderId = parseInt(resolvedParams.orderId, 10);
    if (isNaN(orderId)) {
        return new NextResponse("Geçersiz sipariş ID", { status: 400 });
    }

    const order = await db.order.findUnique({
        where: { id: orderId },
        include: { items: true }
    });

    if (!order) {
        return new NextResponse("Sipariş bulunamadı", { status: 404 });
    }

    const settingsRows = await db.systemSetting.findMany();
    const settings = settingsRows.reduce(
        (acc, curr) => ({ ...acc, [curr.key]: curr.value }),
        {} as Record<string, string>
    );

    let edmUuid = request.nextUrl.searchParams.get("edmUuid");
    let edmId = request.nextUrl.searchParams.get("edmId");

    if ((!edmUuid && !edmId) && order.invoiceUrl && order.invoiceUrl.includes("/api/invoice-pdf/")) {
        try {
            const parsed = new URL(order.invoiceUrl, "http://localhost");
            edmUuid = parsed.searchParams.get("edmUuid");
            edmId = parsed.searchParams.get("edmId");
        } catch {}
    }

    // Legacy support: if order has a direct http storage URL and no EDM params, redirect to it
    if (!edmUuid && !edmId && order.invoiceUrl && order.invoiceUrl.startsWith("https://") && !order.invoiceUrl.includes("faturaentegrator.com/download/invoice/")) {
        return NextResponse.redirect(order.invoiceUrl);
    }

    // If no EDM identifier yet, create invoice directly on EDM
    if (!edmUuid && !edmId) {
        const created = await createEdmInvoiceDirect(order, order.items, settings);
        if (created.success && created.pdfUrl) {
            await db.order.update({
                where: { id: orderId },
                data: { invoiceStatus: "created", invoiceUrl: created.pdfUrl }
            });
            edmUuid = created.uuid || null;
            edmId = created.serialNumber || null;
        } else if (created.error) {
            return new NextResponse(
                `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>EDM Fatura Hatası</title></head>
                <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#f8fafc;color:#1e293b;margin:0;">
                    <div style="background:white;padding:32px;border-radius:16px;box-shadow:0 10px 25px rgba(0,0,0,0.08);max-width:480px;text-align:center;border:1px solid #fee2e2;">
                        <h2 style="color:#dc2626;margin-top:0;">EDM Fatura Oluşturulamadı</h2>
                        <p style="color:#475569;line-height:1.6;">${created.error}</p>
                    </div>
                </body></html>`,
                { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
            );
        }
    }

    if (edmUuid || edmId) {
        try {
            const pdfBuffer = await fetchEdmInvoicePdfBuffer(
                { uuid: edmUuid || undefined, id: edmId || undefined },
                settings
            );
            if (pdfBuffer && pdfBuffer.length > 0) {
                const fileName = `fatura_${edmId || order.externalId || orderId}.pdf`;
                return new NextResponse(new Uint8Array(pdfBuffer), {
                    status: 200,
                    headers: {
                        "Content-Type": "application/pdf",
                        "Content-Disposition": `inline; filename="${fileName}"`,
                        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
                    }
                });
            }
        } catch (e: any) {
            return new NextResponse("EDM üzerinden PDF çekilirken hata oluştu: " + e.message, { status: 500 });
        }
    }

    return new NextResponse("EDM üzerinde fatura PDF verisi bulunamadı.", { status: 404 });
}
