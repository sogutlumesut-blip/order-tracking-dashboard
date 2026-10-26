import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import fs from "fs";
import path from "path";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) {
            return new NextResponse("Stok ID belirtilmedi.", { status: 400 });
        }

        const stock = await db.warehouseStock.findUnique({
            where: { id: Number(id) }
        });

        if (!stock) {
            return new NextResponse("Depo stok kaydı bulunamadı.", { status: 404 });
        }

        // 1. If imageUrl is an HTTP/HTTPS URL: redirect to CDN
        if (stock.imageUrl && (stock.imageUrl.startsWith("http://") || stock.imageUrl.startsWith("https://"))) {
            return NextResponse.redirect(stock.imageUrl);
        }

        // 2. If imageUrl is a Base64 data URL: stream buffer
        if (stock.imageUrl && stock.imageUrl.startsWith("data:image/")) {
            const matches = stock.imageUrl.match(/^data:(image\/[a-zA-Z0-9\+\-\.]+);base64,(.+)$/);
            if (matches) {
                const mimeType = matches[1];
                const buffer = Buffer.from(matches[2], "base64");
                return new NextResponse(buffer, {
                    status: 200,
                    headers: {
                        "Content-Type": mimeType,
                        "Content-Length": buffer.length.toString(),
                        "Cache-Control": "public, max-age=31536000, immutable"
                    }
                });
            }
        }

        // 3. Fallback: try finding image from matching order or catalog by orderNo or SKU
        if (stock.orderNo) {
            try {
                const matchedOrder = await db.order.findFirst({
                    where: {
                        OR: [
                            { externalId: { contains: stock.orderNo } },
                            { trackingNumber: { contains: stock.orderNo } },
                            { cargoTrackingNumber: { contains: stock.orderNo } }
                        ]
                    },
                    include: { items: true }
                });
                const img = matchedOrder?.items?.[0]?.image_src;
                if (img && (img.startsWith("http://") || img.startsWith("https://"))) {
                    // Cache to DB
                    await db.warehouseStock.update({
                        where: { id: stock.id },
                        data: { imageUrl: img }
                    }).catch(() => {});
                    return NextResponse.redirect(img);
                }
            } catch { /* ignore */ }
        }

        if (stock.sku && stock.sku !== "Bilinmiyor") {
            try {
                const matchedItem = await db.orderItem.findFirst({
                    where: {
                        sku: { contains: stock.sku },
                        NOT: { image_src: "" }
                    },
                    select: { image_src: true }
                });
                if (matchedItem?.image_src && (matchedItem.image_src.startsWith("http://") || matchedItem.image_src.startsWith("https://"))) {
                    await db.warehouseStock.update({
                        where: { id: stock.id },
                        data: { imageUrl: matchedItem.image_src }
                    }).catch(() => {});
                    return NextResponse.redirect(matchedItem.image_src);
                }
            } catch { /* ignore */ }
        }

        // 4. Fallback: extract image from stored PDF on the fly
        if (stock.pdfPath) {
            try {
                let pdfBuffer: Buffer | null = null;
                if (stock.pdfPath.startsWith("data:application/pdf;base64,")) {
                    pdfBuffer = Buffer.from(stock.pdfPath.replace("data:application/pdf;base64,", ""), "base64");
                } else if (stock.pdfPath.startsWith("/uploads/")) {
                    const localPath = path.join(process.cwd(), "public", stock.pdfPath);
                    if (fs.existsSync(localPath)) {
                        pdfBuffer = fs.readFileSync(localPath);
                    }
                }

                if (pdfBuffer) {
                    const pdfParseModule = require('pdf-parse');
                    if (pdfParseModule.PDFParse) {
                        const imgParser = new pdfParseModule.PDFParse({ data: pdfBuffer });
                        const imgRes = await imgParser.getImage({ imageDataUrl: true });
                        const firstImg = imgRes?.pages?.[0]?.images?.[0];
                        if (firstImg?.dataUrl) {
                            // Cache to DB
                            await db.warehouseStock.update({
                                where: { id: stock.id },
                                data: { imageUrl: firstImg.dataUrl }
                            }).catch(() => {});

                            const matches = firstImg.dataUrl.match(/^data:(image\/[a-zA-Z0-9\+\-\.]+);base64,(.+)$/);
                            if (matches) {
                                const buffer = Buffer.from(matches[2], "base64");
                                return new NextResponse(buffer, {
                                    status: 200,
                                    headers: {
                                        "Content-Type": matches[1],
                                        "Content-Length": buffer.length.toString(),
                                        "Cache-Control": "public, max-age=31536000, immutable"
                                    }
                                });
                            }
                        }
                    }
                }
            } catch (pdfErr) {
                console.warn("PDF image extraction on the fly error:", pdfErr);
            }
        }

        // 5. SVG Fallback: A modern placeholder SVG
        const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" fill="none">
            <rect width="100" height="100" rx="12" fill="#F1F5F9"/>
            <path d="M50 35L65 43.66V61L50 69.66L35 61V43.66L50 35Z" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M50 35V52.33M65 43.66L50 52.33M35 43.66L50 52.33" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;

        return new NextResponse(placeholderSvg, {
            status: 200,
            headers: {
                "Content-Type": "image/svg+xml",
                "Cache-Control": "public, max-age=86400"
            }
        });
    } catch (error: any) {
        console.error("GET /api/warehouse-stock/image Error:", error);
        return new NextResponse(`Görsel hatası: ${error.message}`, { status: 500 });
    }
}
