import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { parseReturnFormPdf } from "@/lib/return-pdf-parser";
import fs from "fs";
import path from "path";

// GET: List all warehouse stock
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const status = searchParams.get("status") || "all";

        const where: any = {};
        if (status !== "all") {
            where.status = status;
        }

        const stocks = await db.warehouseStock.findMany({
            where,
            orderBy: { createdAt: "desc" }
        });

        return NextResponse.json({ success: true, stocks });
    } catch (error: any) {
        console.error("GET /api/warehouse-stock Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Upload single/multiple PDFs OR add/sync stock data
export async function POST(req: NextRequest) {
    try {
        const contentType = req.headers.get("content-type") || "";

        // 1. Multipart Form Data (File Upload from Browser or Watcher)
        if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();
            const files = formData.getAll("file") as File[];

            if (!files || files.length === 0) {
                return NextResponse.json({ error: "Yüklenecek PDF dosyası bulunamadı." }, { status: 400 });
            }

            const results = [];

            for (const file of files) {
                if (!file.name.toLowerCase().endsWith(".pdf")) continue;

                const bytes = await file.arrayBuffer();
                const buffer = Buffer.from(bytes);

                // Save PDF to public directory (with safe fallback for serverless environments)
                const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
                let publicUrl: string | null = null;
                try {
                    const uploadsDir = path.join(process.cwd(), "public", "uploads", "warehouse-returns");
                    if (!fs.existsSync(uploadsDir)) {
                        fs.mkdirSync(uploadsDir, { recursive: true });
                    }
                    const filePath = path.join(uploadsDir, safeName);
                    fs.writeFileSync(filePath, buffer);
                    publicUrl = `/uploads/warehouse-returns/${safeName}`;
                } catch (fsErr) {
                    console.warn("Dosya sistemi yazma hatası (Vercel read-only), Base64 fallback kullanılıyor");
                    const b64 = buffer.toString('base64');
                    publicUrl = `data:application/pdf;base64,${b64}`;
                }

                // Parse PDF with fileName awareness
                let parsed;
                try {
                    parsed = await parseReturnFormPdf(buffer, file.name);
                } catch (parseErr: any) {
                    results.push({
                        fileName: file.name,
                        success: false,
                        error: `PDF okunamadı: ${parseErr.message}`
                    });
                    continue;
                }

                // Smart database order lookup fallback:
                // If SKU is missing or "Bilinmiyor", but we have an orderNo:
                if ((!parsed.sku || parsed.sku === "Bilinmiyor" || parsed.sku.toLowerCase() === "unknown") && parsed.orderNo) {
                    try {
                        const matchedOrder = await db.order.findFirst({
                            where: {
                                OR: [
                                    { externalId: { contains: parsed.orderNo } },
                                    { trackingNumber: { contains: parsed.orderNo } },
                                    { cargoTrackingNumber: { contains: parsed.orderNo } }
                                ]
                            },
                            include: { items: true }
                        });
                        if (matchedOrder && matchedOrder.items.length > 0) {
                            const firstItem = matchedOrder.items[0];
                            if (firstItem.sku) parsed.sku = firstItem.sku;
                            if (firstItem.dimensions && (!parsed.dimensions || parsed.dimensions === "Bilinmiyor")) {
                                parsed.dimensions = firstItem.dimensions;
                            }
                            if (firstItem.material && (!parsed.material || parsed.material === "Bilinmiyor")) {
                                parsed.material = firstItem.material;
                            }
                            if (matchedOrder.source && parsed.source === "Bilinmiyor") {
                                parsed.source = matchedOrder.source;
                            }
                            if (firstItem.image_src && !parsed.imageUrl) {
                                parsed.imageUrl = firstItem.image_src;
                            }
                        }
                    } catch (dbLookupErr) {
                        console.warn("Sipariş veritabanından çekilemedi:", dbLookupErr);
                    }
                }

                // If image still not found, check if any order item in db has image for this SKU
                const candidateSku = parsed.sku || "";
                if (!parsed.imageUrl && candidateSku && candidateSku !== "Bilinmiyor" && candidateSku.toLowerCase() !== "unknown") {
                    try {
                        const itemWithImg = await db.orderItem.findFirst({
                            where: {
                                sku: { contains: candidateSku },
                                NOT: { image_src: "" }
                            },
                            select: { image_src: true }
                        });
                        if (itemWithImg?.image_src) {
                            parsed.imageUrl = itemWithImg.image_src;
                        }
                    } catch { /* ignore */ }
                }

                // Validation check: at least SKU or orderNo must exist
                if (!parsed.sku && !parsed.orderNo) {
                    results.push({
                        fileName: file.name,
                        success: false,
                        error: "PDF içinden SKU veya Sipariş No okunamadı."
                    });
                    continue;
                }

                const finalSku = parsed.sku || "Bilinmiyor";
                const finalDimensions = parsed.dimensions || "Bilinmiyor";
                const finalMaterial = parsed.material || "Bilinmiyor";

                // Check if already exists by orderNo or (sku + dimensions + material)
                let existing = null;
                if (parsed.orderNo) {
                    existing = await db.warehouseStock.findFirst({
                        where: { orderNo: parsed.orderNo }
                    });
                }
                if (!existing && finalSku !== "Bilinmiyor" && finalDimensions !== "Bilinmiyor") {
                    existing = await db.warehouseStock.findFirst({
                        where: {
                            sku: finalSku,
                            dimensions: finalDimensions,
                            material: finalMaterial
                        }
                    });
                }

                let stockRecord;
                if (existing) {
                    stockRecord = await db.warehouseStock.update({
                        where: { id: existing.id },
                        data: {
                            sku: finalSku !== "Bilinmiyor" ? finalSku : existing.sku,
                            dimensions: finalDimensions !== "Bilinmiyor" ? finalDimensions : existing.dimensions,
                            material: finalMaterial !== "Bilinmiyor" ? finalMaterial : existing.material,
                            source: parsed.source !== "Bilinmiyor" ? parsed.source : existing.source,
                            returnReason: parsed.returnReason || existing.returnReason,
                            pdfPath: publicUrl || existing.pdfPath,
                            imageUrl: parsed.imageUrl || existing.imageUrl
                        }
                    });
                } else {
                    stockRecord = await db.warehouseStock.create({
                        data: {
                            sku: finalSku,
                            dimensions: finalDimensions,
                            material: finalMaterial,
                            orderNo: parsed.orderNo || null,
                            source: parsed.source,
                            returnReason: parsed.returnReason || null,
                            pdfPath: publicUrl,
                            imageUrl: parsed.imageUrl || null,
                            status: "available"
                        }
                    });
                }

                results.push({
                    fileName: file.name,
                    success: true,
                    stock: stockRecord
                });
            }

            return NextResponse.json({
                success: true,
                count: results.filter(r => r.success).length,
                results
            });
        }

        // 2. JSON Body (Direct API sync from Watcher Script)
        const body = await req.json();

        // Support array of items or single item
        const items = Array.isArray(body) ? body : [body];
        const saved = [];

        for (const item of items) {
            if (!item.sku && !item.orderNo) continue;

            let existing = null;
            if (item.orderNo) {
                existing = await db.warehouseStock.findFirst({
                    where: { orderNo: item.orderNo }
                });
            }

            let record;
            if (existing) {
                record = await db.warehouseStock.update({
                    where: { id: existing.id },
                    data: {
                        sku: item.sku || existing.sku,
                        dimensions: item.dimensions || existing.dimensions,
                        material: item.material || existing.material,
                        source: item.source || existing.source,
                        returnReason: item.returnReason || existing.returnReason,
                        pdfPath: item.pdfPath || existing.pdfPath,
                        imageUrl: item.imageUrl || existing.imageUrl,
                        status: item.status || existing.status
                    }
                });
            } else {
                record = await db.warehouseStock.create({
                    data: {
                        sku: item.sku || "Bilinmiyor",
                        dimensions: item.dimensions || "Bilinmiyor",
                        material: item.material || "Bilinmiyor",
                        orderNo: item.orderNo || null,
                        source: item.source || "Bilinmiyor",
                        returnReason: item.returnReason || null,
                        pdfPath: item.pdfPath || null,
                        imageUrl: item.imageUrl || null,
                        status: item.status || "available"
                    }
                });
            }
            saved.push(record);
        }

        return NextResponse.json({ success: true, count: saved.length, stocks: saved });
    } catch (error: any) {
        console.error("POST /api/warehouse-stock Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PATCH: Update status (e.g. mark as used in order or mark available)
export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { id, status, usedInOrderId, sku, dimensions, material, orderNo, source, returnReason, imageUrl } = body;

        if (!id) {
            return NextResponse.json({ error: "Stok ID gereklidir." }, { status: 400 });
        }

        const updateData: any = {};
        if (status !== undefined) {
            updateData.status = status;
            updateData.usedInOrderId = status === "used" ? (usedInOrderId ? Number(usedInOrderId) : null) : null;
            updateData.usedAt = status === "used" ? new Date() : null;
        }
        if (sku !== undefined) updateData.sku = sku;
        if (dimensions !== undefined) updateData.dimensions = dimensions;
        if (material !== undefined) updateData.material = material;
        if (orderNo !== undefined) updateData.orderNo = orderNo;
        if (source !== undefined) updateData.source = source;
        if (returnReason !== undefined) updateData.returnReason = returnReason;
        if (imageUrl !== undefined) updateData.imageUrl = imageUrl;

        const updated = await db.warehouseStock.update({
            where: { id: Number(id) },
            data: updateData
        });

        return NextResponse.json({ success: true, stock: updated });
    } catch (error: any) {
        console.error("PATCH /api/warehouse-stock Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE: Delete warehouse stock record
export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "Silinecek ID belirtilmedi." }, { status: 400 });
        }

        await db.warehouseStock.delete({
            where: { id: Number(id) }
        });

        return NextResponse.json({ success: true, message: "Depo stok kaydı silindi." });
    } catch (error: any) {
        console.error("DELETE /api/warehouse-stock Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
