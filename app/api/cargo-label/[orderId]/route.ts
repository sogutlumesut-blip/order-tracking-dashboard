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
    let currentY = 820; // Start tighter below MNG

    if (order.items && order.items.length > 0) {
        order.items.forEach((item: any) => {
            if (currentY > 1150) return; // Prevent overflowing

            const rawName = cleanTR(item.name);
            const line1 = rawName.substring(0, 42);
            const line2 = rawName.length > 42 ? rawName.substring(42, 84) : "";

            // Product Name
            itemsZpl += `^FO20,${currentY}^A0N,24,24^FD${line1}^FS\n`;
            if (line2) {
                currentY += 25;
                itemsZpl += `^FO20,${currentY}^A0N,24,24^FD${line2}^FS\n`;
            }

            // Quantity Box on right
            const qtyBoxY = line2 ? currentY - 25 : currentY;
            itemsZpl += `^FO690,${qtyBoxY}^A0N,28,28^FDx ${item.quantity}^FS\n`;

            currentY += 32;

            // Details Line: SKU | Material | Dimensions
            let detailsZpl = "";
            let detailX = 20;

            if (item.sku) {
                detailsZpl += `^FO${detailX},${currentY}^A0N,18,18^FDKOD: ${item.sku}^FS\n`;
                detailX += 160;
            }
            if (item.material) {
                detailsZpl += `^FO${detailX},${currentY}^A0N,18,18^FD${cleanTR(item.material).substring(0, 30)}^FS\n`;
                detailX += 300;
            }
            if (item.dimensions) {
                detailsZpl += `^FO${detailX},${currentY}^A0N,18,18^FD${cleanTR(item.dimensions)}^FS\n`;
            }

            itemsZpl += detailsZpl;
            currentY += 35; // Space for next item
        });
    } else {
        itemsZpl = `^FO20,${currentY}^A0N,24,24^FDURUN BULUNAMADI^FS\n`;
        currentY += 35;
    }

    const dividerY = currentY + 5;
    const qrY = dividerY + 15;

    const trackingNoSafe = order.cargoTrackingNumber || order.barcode || order.id.toString();
    const systemQrData = order.barcode || order.id.toString();
    const noteSafe = cleanTR(order.note || "NOT: YOK").substring(0, 90);
    const customerSafe = cleanTR(order.customer).substring(0, 45);

    const customReceiptZpl = `
^FO20,790^A0N,18,18^FDSIPARIS ICERIGI: ${customerSafe}^FS

${itemsZpl}

^FO20,${dividerY}^GB760,2,2^FS

^FO20,${qrY}^A0N,16,16^FDSISTEM (QR)^FS
^FO20,${qrY + 20}^BQN,2,4^FDQA,${systemQrData}^FS
^FO20,${qrY + 115}^A0N,16,16^FD${systemQrData}^FS

^FO360,${qrY}^A0N,16,16^FDKARGO (DHL/STANDART)^FS
^FO360,${qrY + 20}^BY2,2,55^BCN,55,Y,N,N^FD${trackingNoSafe}^FS
^FO360,${qrY + 95}^A0N,16,16^FDTakip: ${trackingNoSafe}^FS

^FO20,${qrY + 140}^A0N,18,18^FDMUSTERI NOTU: ${noteSafe}^FS
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
                "Content-Disposition": `inline; filename="kargo_fisi_${order.cargoTrackingNumber || orderId}.pdf"`,
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Pragma": "no-cache"
            }
        });

    } catch (e: any) {
        console.error("Error generating label:", e);
        return new NextResponse("Sunucu hatası: " + e.message, { status: 500 });
    }
}
