import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/prisma";
import {
    fetchFaturaEntegratorInvoice,
    findExistingInvoiceForOrder,
    createFaturaEntegratorInvoice
} from "@/lib/fatura-entegrator-api";

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

    // If order already has a real Fatura Entegratör storage PDF URL, redirect directly
    if (
        order.invoiceUrl &&
        order.invoiceUrl.startsWith("https://app.faturaentegrator.com/storage/")
    ) {
        return NextResponse.redirect(order.invoiceUrl);
    }

    const settingsRows = await db.systemSetting.findMany();
    const settings = settingsRows.reduce(
        (acc, curr) => ({ ...acc, [curr.key]: curr.value }),
        {} as Record<string, string>
    );

    // Extract feId from query string or stored invoiceUrl
    let feId = request.nextUrl.searchParams.get("feId");
    if (!feId && order.invoiceUrl && order.invoiceUrl.includes("feId=")) {
        try {
            const parsed = new URL(order.invoiceUrl, "http://localhost");
            feId = parsed.searchParams.get("feId");
        } catch {}
    }

    // If no feId yet, check if invoice already exists on Fatura Entegratör or create one
    if (!feId) {
        const existing = await findExistingInvoiceForOrder(
            String(order.externalId || order.id),
            settings.fe_app_key
        );
        if (existing?.id) {
            feId = String(existing.id);
            if (existing.pdf_url) {
                await db.order.update({
                    where: { id: orderId },
                    data: { invoiceStatus: "created", invoiceUrl: existing.pdf_url }
                });
                return NextResponse.redirect(existing.pdf_url);
            }
        } else {
            const created = await createFaturaEntegratorInvoice(order, order.items, settings);
            if (created.success && created.pdfUrl) {
                await db.order.update({
                    where: { id: orderId },
                    data: { invoiceStatus: "created", invoiceUrl: created.pdfUrl }
                });
                if (created.pdfUrl.startsWith("http")) {
                    return NextResponse.redirect(created.pdfUrl);
                }
                feId = String(created.invoiceId);
            } else if (created.error) {
                return new NextResponse(
                    `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>Fatura Hatası</title></head>
                    <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#f8fafc;color:#1e293b;margin:0;">
                        <div style="background:white;padding:32px;border-radius:16px;box-shadow:0 10px 25px rgba(0,0,0,0.08);max-width:480px;text-align:center;border:1px solid #fee2e2;">
                            <h2 style="color:#dc2626;margin-top:0;">Fatura Oluşturulamadı</h2>
                            <p style="color:#475569;line-height:1.6;">${created.error}</p>
                        </div>
                    </body></html>`,
                    { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
                );
            }
        }
    }

    if (feId) {
        const invoice = await fetchFaturaEntegratorInvoice(feId, settings.fe_app_key);
        if (invoice) {
            if (invoice.pdf_url) {
                await db.order.update({
                    where: { id: orderId },
                    data: { invoiceStatus: "created", invoiceUrl: invoice.pdf_url }
                });
                return NextResponse.redirect(invoice.pdf_url);
            }

            if (invoice.formal_status === "failed" || invoice.workflow_status === "failed") {
                const errMsg = invoice.errors?.[0]?.message || "EDM Bilişim resmileştirme hatası oluştu.";
                return new NextResponse(
                    `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>Fatura Resmileştirme Hatası</title></head>
                    <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#f8fafc;color:#1e293b;margin:0;">
                        <div style="background:white;padding:32px;border-radius:16px;box-shadow:0 10px 25px rgba(0,0,0,0.08);max-width:480px;text-align:center;border:1px solid #fee2e2;">
                            <h2 style="color:#dc2626;margin-top:0;">Fatura Resmileştirme Hatası</h2>
                            <p style="color:#475569;line-height:1.6;">${errMsg}</p>
                            <p style="font-size:13px;color:#64748b;">Lütfen sipariş panelinden <b>Fatura Kes</b> butonuna tekrar tıklayarak yeniden deneyin.</p>
                        </div>
                    </body></html>`,
                    { status: 502, headers: { "Content-Type": "text/html; charset=utf-8" } }
                );
            }

            // Still processing in EDM queue - auto refresh every 3 seconds
            return new NextResponse(
                `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta http-equiv="refresh" content="3"><title>Fatura Hazırlanıyor...</title></head>
                <body style="font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#f8fafc;color:#334155;margin:0;">
                    <div style="background:white;padding:36px;border-radius:16px;box-shadow:0 10px 25px rgba(0,0,0,0.08);max-width:460px;text-align:center;border:1px solid #e2e8f0;">
                        <div style="width:42px;height:42px;border:4px solid #cbd5e1;border-top-color:#4f46e5;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 20px;"></div>
                        <h2 style="margin:0 0 10px;color:#1e293b;">Fatura PDF Hazırlanıyor...</h2>
                        <p style="color:#64748b;font-size:14px;line-height:1.6;margin:0;">Faturanız EDM Bilişim üzerinden resmileştiriliyor. PDF hazır olduğunda bu sayfa otomatik olarak açılacaktır, lütfen birkaç saniye bekleyin.</p>
                    </div>
                    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
                </body></html>`,
                { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
            );
        }
    }

    return new NextResponse("Fatura verisi bulunamadı.", { status: 404 });
}
