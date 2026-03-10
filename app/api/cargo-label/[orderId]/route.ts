import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ orderId: string }> } // FIXED: App Router dynamic segments require Promise unwrapping in latest Next.js versions
) {
    const session = await getSession();
    if (!session) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    // Await params per Next.js 15+ convention
    const resolvedParams = await params;
    const orderId = parseInt(resolvedParams.orderId, 10);

    if (isNaN(orderId)) {
        return new NextResponse("Invalid order ID", { status: 400 });
    }

    const order = await db.order.findUnique({
        where: { id: orderId },
        select: {
            id: true,
            customer: true,
            note: true,
            cargoBarcode: true,
            cargoTrackingNumber: true,
            barcode: true,
            items: {
                select: {
                    name: true,
                    quantity: true,
                    sku: true,
                    material: true,
                    dimensions: true,
                    productNote: true
                }
            }
        }
    });

    if (!order || !order.cargoBarcode) {
        return new NextResponse("Barkod verisi bulunamadı", { status: 404 });
    }

    let zpl = order.cargoBarcode;

    // --- SECOND PAGE: INTERNAL RECEIPT (MANUAL BARCODE REPLACEMENT) ---
    // Helper to remove TR chars since standard ZPL fonts (A0N) might scramble them if CI28 isn't perfectly supported by the printer's specific firmware
    const cleanTR = (text: string) => {
        if (!text) return "";
        return text.replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
            .replace(/Ü/g, 'U').replace(/ü/g, 'u')
            .replace(/Ş/g, 'S').replace(/ş/g, 's')
            .replace(/İ/g, 'I').replace(/ı/g, 'i')
            .replace(/Ö/g, 'O').replace(/ö/g, 'o')
            .replace(/Ç/g, 'C').replace(/ç/g, 'c')
            .toUpperCase();
    };

    let itemsZpl = "";
    let currentY = 870; // Start printing *safely* below the MNG Kargo section (MNG ends around Y=840)

    if (order.items && order.items.length > 0) {
        order.items.forEach((item: any, idx: number) => {
            if (currentY > 800) return; // Prevent overflowing a 4x6 label (length ~1218 dots at 8dpmm, keep safe margin)

            const nameSafe = cleanTR(item.name).substring(0, 45); // Truncate long names
            itemsZpl += `^FO10,${currentY}^A0N,25,25^FD${nameSafe}^FS\n`;

            const qtyStr = `x ${item.quantity}`;
            itemsZpl += `^FO700,${currentY}^A0N,30,30^FD${qtyStr}^FS\n`;

            let details = "";
            if (item.sku) details += `KOD: ${item.sku} | `;
            if (item.material) details += `${item.material}`;

            itemsZpl += `^FO10,${currentY + 30}^A0N,20,20^FD${cleanTR(details).substring(0, 65)}^FS\n`;

            if (item.dimensions) {
                itemsZpl += `^FO10,${currentY + 60}^A0N,20,20^FD${cleanTR(item.dimensions)}^FS\n`;
                currentY += 95;
            } else {
                currentY += 75;
            }
        });
    } else {
        itemsZpl = `^FO10,${currentY}^A0N,25,25^FDURUN BULUNAMADI^FS\n`;
        currentY += 35;
    }

    const dividerY = currentY + 5;
    const qrY = dividerY + 15;

    const trackingNoSafe = order.cargoTrackingNumber || order.barcode || order.id.toString();
    const systemQrData = order.barcode || order.id.toString();
    const noteSafe = cleanTR(order.note || "NOT: YOK").substring(0, 70);
    const customerSafe = cleanTR(order.customer).substring(0, 30);

    const customReceiptZpl = `
^FO10,830^GB790,2,2^FS
^FO10,840^A0N,25,25^FDSIPARIS ICERIGI: ${customerSafe}^FS

${itemsZpl}

^FO10,${dividerY}^GB790,2,2^FS

^FO10,${qrY}^A0N,20,20^FDSISTEM (QR)^FS
^FO10,${qrY + 20}^BQN,2,4^FDQA,${systemQrData}^FS
^FO10,${qrY + 110}^A0N,20,20^FD${systemQrData}^FS

^FO400,${qrY}^A0N,20,20^FDKARGO (DHL/STANDART)^FS
^FO400,${qrY + 20}^BY3,3,60^BCN,60,Y,N,N^FD${trackingNoSafe}^FS
^FO400,${qrY + 100}^A0N,20,20^FDTakip: ${trackingNoSafe}^FS

^FO10,${qrY + 140}^A0N,20,20^FDMUSTERI NOTU: ${noteSafe}^FS
`;

    // Append our custom receipt natively inside the MNG label, before the closing ^XZ
    if (zpl.includes('^XZ')) {
        zpl = zpl.replace('^XZ', customReceiptZpl + '\n^XZ');
    } else {
        zpl = zpl + "\n" + customReceiptZpl;
    }


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
