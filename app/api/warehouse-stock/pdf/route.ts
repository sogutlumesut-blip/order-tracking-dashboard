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

        if (!stock || !stock.pdfPath) {
            return new NextResponse("Bu stoğa ait PDF bulunamadı.", { status: 404 });
        }

        // 1. Base64 Data URL (saved on serverless / Vercel)
        if (stock.pdfPath.startsWith("data:application/pdf;base64,")) {
            const base64Data = stock.pdfPath.replace("data:application/pdf;base64,", "");
            const buffer = Buffer.from(base64Data, "base64");
            const safeOrderName = (stock.orderNo || stock.sku || "return-form").replace(/[^a-zA-Z0-9_\-]/g, "_");

            return new NextResponse(buffer, {
                status: 200,
                headers: {
                    "Content-Type": "application/pdf",
                    "Content-Disposition": `inline; filename="ReturnForm_${safeOrderName}.pdf"`,
                    "Content-Length": buffer.length.toString(),
                    "Cache-Control": "public, max-age=31536000, immutable"
                }
            });
        }

        // 2. Local uploads folder
        if (stock.pdfPath.startsWith("/uploads/")) {
            const filePath = path.join(process.cwd(), "public", stock.pdfPath);
            if (fs.existsSync(filePath)) {
                const buffer = fs.readFileSync(filePath);
                return new NextResponse(buffer, {
                    status: 200,
                    headers: {
                        "Content-Type": "application/pdf",
                        "Content-Disposition": `inline; filename="ReturnForm_${stock.id}.pdf"`,
                        "Content-Length": buffer.length.toString(),
                    }
                });
            }
        }

        // 3. External HTTP URL
        if (stock.pdfPath.startsWith("http")) {
            return NextResponse.redirect(stock.pdfPath);
        }

        return new NextResponse("PDF dosyası okunamadı.", { status: 404 });
    } catch (error: any) {
        console.error("GET /api/warehouse-stock/pdf Error:", error);
        return new NextResponse(`PDF görüntüleme hatası: ${error.message}`, { status: 500 });
    }
}
