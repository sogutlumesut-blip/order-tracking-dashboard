import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: { orderId: string } }
) {
    const session = await getSession();
    if (!session) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const orderId = parseInt(params.orderId, 10);
    if (isNaN(orderId)) {
        return new NextResponse("Invalid order ID", { status: 400 });
    }

    const order = await db.order.findUnique({
        where: { id: orderId },
        select: { cargoBarcode: true, cargoTrackingNumber: true }
    });

    if (!order || !order.cargoBarcode) {
        return new NextResponse("Barkod verisi bulunamadı", { status: 404 });
    }

    const zpl = order.cargoBarcode;

    // MNG ZPL typically contains native headers, but let's ensure Labelary parses it.
    // Ensure we POST it to Labelary APIs: http://api.labelary.com/v1/printers/8dpmm/labels/4x6/

    try {
        const url = "http://api.labelary.com/v1/printers/8dpmm/labels/4x6/0/";

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Accept": "application/pdf",
                "Content-Type": "application/x-www-form-urlencoded" // sending raw string works natively if it is not form encoded but Node handles it weirdly.
            },
            body: zpl // raw zpl body
        });

        if (!response.ok) {
            const err = await response.text();
            console.error("[Labelary Error]", response.status, err);
            return new NextResponse("PDF oluşturulurken hata oluştu: " + err, { status: 500 });
        }

        const pdfBuffer = await response.arrayBuffer();

        return new NextResponse(pdfBuffer, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `inline; filename="kargo_fisi_${order.cargoTrackingNumber || orderId}.pdf"`
            }
        });

    } catch (e: any) {
        console.error("Error generating label:", e);
        return new NextResponse("Sunucu hatası: " + e.message, { status: 500 });
    }
}
