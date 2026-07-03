import { db } from "@/lib/prisma";
import { createKargoEntegratorShipment } from "@/lib/kargo-entegrator-api";
import fs from "fs";

const DEBUG_LOG_PATH = "/tmp/oms_debug.log";

function serverLog(msg: string) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${msg}\n`;
    try {
        fs.appendFileSync(DEBUG_LOG_PATH, line);
        console.log(line.trim());
    } catch {
        // ignore
    }
}

async function logActivity(orderId: number, author: string, action: string, details: string) {
    try {
        await db.orderActivity.create({
            data: {
                orderId,
                author,
                action,
                details
            }
        });
    } catch (e: any) {
        console.error("Failed to log activity:", e.message);
    }
}

export async function generateDHLShipment(orderId: number, actorName: string, bypassStatusUpdate: boolean = false) {
    serverLog(`[KARGO_ENTEGRATOR] START: Generating cargo label for Order #${orderId}`);

    try {
        const order = await db.order.findUnique({
            where: { id: orderId },
            include: { items: true }
        });

        if (!order) {
            serverLog(`[KARGO_ENTEGRATOR] ERR: Order not found #${orderId}`);
            return { error: "Sipariş bulunamadı" };
        }

        await logActivity(orderId, actorName, "CARGO_START", "Kargo Entegratör API'sine gönderi oluşturma kaydı iletiliyor...");

        // 1. Create Shipment via Kargo Entegrator API
        const shipmentRes = await createKargoEntegratorShipment(order, order.items);

        if (shipmentRes.error) {
            serverLog(`[KARGO_ENTEGRATOR] Error: ${shipmentRes.error}`);
            return { error: `Kargo Entegratör Hatası: ${shipmentRes.error}` };
        }

        if (!shipmentRes.success || !shipmentRes.shipmentId) {
            return { error: "Gönderi oluşturuldu ancak ID alınamadı." };
        }

        const trackingNo = shipmentRes.barcode || String(shipmentRes.shipmentId);
        
        // 2. Update DB with Barcode and PDF
        const updateData: any = {
            updatedAt: new Date(),
            cargoTrackingNumber: trackingNo,
            cargoBarcode: trackingNo,
            trackingNumber: trackingNo
        };

        if (!bypassStatusUpdate) {
            updateData.status = "shipped";
        }

        if (shipmentRes.labelPdfBase64) {
            updateData.cargoLabelPdf = shipmentRes.labelPdfBase64;
        }

        serverLog(`[KARGO_ENTEGRATOR] Success! Updating Order ${order.id}. Tracking No: ${trackingNo}`);
        await db.order.update({
            where: { id: orderId },
            data: updateData
        });

        await logActivity(
            orderId, 
            actorName, 
            "CARGO_SUCCESS", 
            `Kargo başarıyla oluşturuldu. (ID: ${shipmentRes.shipmentId}, Barkod: ${trackingNo})`
        );

        return { 
            success: true, 
            message: "Kargo etiketi başarıyla oluşturuldu!", 
            cargoBarcode: trackingNo, 
            cargoTrackingNumber: trackingNo 
        };

    } catch (e: any) {
        serverLog(`[KARGO_ENTEGRATOR] CRITICAL_ERROR: ${e.message}`);
        return { error: e.message };
    }
}
