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
            cargoLabelPdf: true,
            barcode: true,
            labels: true,
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

    if (!order || (!order.cargoBarcode && !order.cargoLabelPdf)) {
        return new NextResponse("Barkod verisi bulunamadı", { status: 404 });
    }

    let zpl = order.cargoBarcode || "";

    if (!zpl.startsWith('^XA')) {
        let shipmentId = null;
        if (order.cargoLabelPdf && order.cargoLabelPdf.includes('app.kargoentegrator.com/print-pdf')) {
            try {
                const urlObj = new URL(order.cargoLabelPdf);
                shipmentId = urlObj.searchParams.get('shipments[0]');
            } catch(e) {}
        } else if (order.cargoLabelPdf && order.cargoLabelPdf.startsWith('kargoentegrator:')) {
            shipmentId = order.cargoLabelPdf.replace('kargoentegrator:', '');
        }

        if (shipmentId) {
            const API_KEY = process.env.KARGO_ENTEGRATOR_API_KEY || "OylOoz2vKllZtByiBAbl65NpdsnaNPVlpVTRzgNte8e42427";
            const BASE_URL = "https://app.kargoentegrator.com/api";
            
            try {
                const pdfRes = await fetch(`${BASE_URL}/print-pdf?shipments[0]=${shipmentId}`, {
                    headers: {
                        "Authorization": `Bearer ${API_KEY}`,
                        "Accept": "application/pdf"
                    }
                });
                
                if (!pdfRes.ok) throw new Error("PDF alınamadı");
                
                return new NextResponse(pdfRes.body, {
                    status: 200,
                    headers: {
                        "Content-Type": "application/pdf",
                        "Content-Disposition": `inline; filename="kargo_fisi_${order.cargoTrackingNumber || orderId}.pdf"`,
                        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                        "Pragma": "no-cache"
                    }
                });
            } catch (e: any) {
                return new NextResponse("Kargo Entegratör'den PDF çekilirken hata oluştu: " + e.message, { status: 500 });
            }
        } else if (order.cargoLabelPdf && order.cargoLabelPdf.startsWith('http')) {
            return NextResponse.redirect(order.cargoLabelPdf);
        } else if (order.cargoLabelPdf && order.cargoLabelPdf.startsWith('data:application/pdf;base64,')) {
            const base64Data = order.cargoLabelPdf.replace('data:application/pdf;base64,', '');
            const pdfBuffer = Buffer.from(base64Data, 'base64');
            return new NextResponse(pdfBuffer, {
                status: 200,
                headers: {
                    "Content-Type": "application/pdf",
                    "Content-Disposition": `inline; filename="kargo_fisi_${order.cargoTrackingNumber || orderId}.pdf"`,
                    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                    "Pragma": "no-cache"
                }
            });
        } else if (order.cargoLabelPdf && order.cargoLabelPdf.startsWith('data:image/')) {
            const match = order.cargoLabelPdf.match(/^data:(image\/[a-zA-Z+.-]+);base64,/);
            if (match) {
                const mimeType = match[1];
                const base64Data = order.cargoLabelPdf.substring(match[0].length);
                const imgBuffer = Buffer.from(base64Data, 'base64');
                const ext = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : mimeType.split('/')[1];
                return new NextResponse(imgBuffer, {
                    status: 200,
                    headers: {
                        "Content-Type": mimeType,
                        "Content-Disposition": `inline; filename="kargo_fisi_${order.cargoTrackingNumber || orderId}.${ext}"`,
                        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                        "Pragma": "no-cache"
                    }
                });
            }
            return new NextResponse("Geçersiz Resim Formatı", { status: 400 });
        } else if (order.cargoLabelPdf && order.cargoLabelPdf.startsWith('production_files/')) {
            return NextResponse.redirect(`https://printmarkt.co/${order.cargoLabelPdf}`);
        } else if (order.cargoLabelPdf && (order.cargoLabelPdf.startsWith('/uploads/') || order.cargoLabelPdf.startsWith('uploads/'))) {
            const cleanPath = order.cargoLabelPdf.startsWith('/') ? order.cargoLabelPdf : `/${order.cargoLabelPdf}`;
            return NextResponse.redirect(`https://duvarkagidimarketi.com${cleanPath}`);
        } else if (order.cargoLabelPdf && /^[A-Za-z0-9+/=]+$/.test(order.cargoLabelPdf)) {
            try {
                const buffer = Buffer.from(order.cargoLabelPdf, 'base64');
                const fileHeader = buffer.subarray(0, 4).toString('utf-8');
                if (fileHeader === '%PDF') {
                    return new NextResponse(buffer, {
                        status: 200,
                        headers: {
                            "Content-Type": "application/pdf",
                            "Content-Disposition": `inline; filename="kargo_fisi_${order.cargoTrackingNumber || orderId}.pdf"`,
                            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                            "Pragma": "no-cache"
                        }
                    });
                }
                
                if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
                    return new NextResponse(buffer, {
                        status: 200,
                        headers: {
                            "Content-Type": "image/jpeg",
                            "Content-Disposition": `inline; filename="kargo_fisi_${order.cargoTrackingNumber || orderId}.jpg"`,
                            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                            "Pragma": "no-cache"
                        }
                    });
                } else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
                    return new NextResponse(buffer, {
                        status: 200,
                        headers: {
                            "Content-Type": "image/png",
                            "Content-Disposition": `inline; filename="kargo_fisi_${order.cargoTrackingNumber || orderId}.png"`,
                            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                            "Pragma": "no-cache"
                        }
                    });
                }
            } catch (e) {}
            return new NextResponse("Geçersiz Barkod Formatı veya ZPL bulunamadı.", { status: 400 });
        } else {
            return new NextResponse("Geçersiz Barkod Formatı veya ZPL bulunamadı.", { status: 400 });
        }
    }

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
    let currentY = 780; // Start tighter below MNG

    if (order.items && order.items.length > 0) {
        order.items.forEach((item: any) => {
            if (currentY > 1150) return; // Prevent overflowing

            const rawName = cleanTR(item.name);
            const isMultiline = rawName.length > 40;

            // Product Name (Auto Word Wrap using ^FB)
            itemsZpl += `^FO20,${currentY}^A0N,22,22^FB640,2,2,L,0^FD${rawName}^FS\n`;

            // Quantity Box on right
            itemsZpl += `^FO670,${currentY}^A0N,28,28^FB100,1,0,R,0^FDx ${item.quantity}^FS\n`;
            
            // Advance Y after product name
            currentY += isMultiline ? 45 : 25;

            // Details Line: SKU | Material | Dimensions
            let details = [];
            if (item.sku) details.push(`KOD: ${item.sku}`);
            if (item.material) details.push(cleanTR(item.material).substring(0, 30));
            if (item.dimensions) details.push(cleanTR(item.dimensions));
            
            itemsZpl += `^FO20,${currentY}^A0N,18,18^FB760,1,0,L,0^FD${details.join('   -   ')}^FS\n`;

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

    // Parse labels to check for USA DEPO / USA UPS
    const getLabels = (labelsStr: string | null | undefined): string[] => {
        if (!labelsStr) return [];
        try {
            const parsed = typeof labelsStr === 'string' ? JSON.parse(labelsStr) : labelsStr;
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    };

    const orderLabels = getLabels(order.labels);
    const isUSA = orderLabels.some(l => {
        const upper = l.toUpperCase();
        return upper.includes("USA DEPO") || upper.includes("USA UPS") || upper.includes("USA");
    });

    let usaDepoZpl = "";
    if (isUSA) {
        // Draw a reverse-printed (white text on black background) "USA DEPO" badge on the top right
        usaDepoZpl = `^FO550,740^GB230,35,35^FS\n^FO570,746^A0N,22,22^FR^FDUSA DEPO^FS\n`;
    }

    const customReceiptZpl = `
${usaDepoZpl}
^FO20,750^A0N,18,18^FDSIPARIS ICERIGI: ${customerSafe}^FS

${itemsZpl}

^FO20,${dividerY}^GB760,2,2^FS

^FO20,${qrY}^A0N,18,18^FDSISTEM (QR)^FS
^FO20,${qrY + 25}^BQN,2,3^FDQA,${systemQrData}^FS
^FO20,${qrY + 115}^A0N,16,16^FD${systemQrData}^FS

^FO360,${qrY}^A0N,18,18^FDKARGO (DHL/STANDART)^FS
^FO360,${qrY + 25}^BY2,2,60^BCN,60,Y,N,N^FD${trackingNoSafe}^FS

^FO20,${qrY + 145}^A0N,20,20^FB760,2,2,L,0^FDMUSTERI NOTU: ${noteSafe}^FS
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
