
import { NextResponse } from "next/server"
import { db } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function POST(req: Request) {
    try {
        const body = await req.json()
        console.log("Kargo Webhook Payload:", JSON.stringify(body, null, 2))

        // Kargo Entegrator Payload Structure (Subject to verification, but based on typical patterns)
        // Usually sends 'status', 'shipment_id' or 'tracking_number'
        // If the user set "Durum: Yola Çıktı", then this webhook triggers on Shipped.

        const trackingNumber = body.tracking_number
        const shipmentId = body.shipment_id || body.id
        const barcode = body.barcode
        const status = body.status // 'shipped', 'delivered', etc.
        const platformId = body.platform_id ? String(body.platform_id) : null

        if (!platformId && !barcode) {
            return NextResponse.json({ message: "Missing platform_id or barcode", received: body }, { status: 200 }) // Return 200 to stop retry loops
        }

        // Logic to update DB
        // 1. Find Order
        // Try WC-ID first
        let order = await db.order.findUnique({ where: { barcode: `WC-${platformId}` } })

        if (!order && platformId) {
            order = await db.order.findUnique({ where: { barcode: platformId } })
        }

        // If still not found and we have a barcode, try matching cargoBarcode? (Unlikely to be stored yet)

        if (order) {
            const updateData: any = {}
            if (trackingNumber) updateData.cargoTrackingNumber = trackingNumber
            
            // Do not overwrite a valid ZPL barcode with a simple numeric ID
            if (barcode) {
                if (!order.cargoBarcode || !order.cargoBarcode.startsWith('^XA')) {
                    updateData.cargoBarcode = barcode
                }
            }

            // AUTOMATION: Update status based on delivery status or general signal
            const statusLower = (status || "").toLowerCase();
            const isDelivered = 
                statusLower === 'delivered' || 
                statusLower === 'teslim_edildi' || 
                statusLower === 'teslim edildi' || 
                statusLower === 'teslim' ||
                !!body.delivered_at || 
                !!body.real_delivered_date;

            let statusChanged = false;
            let activityDetails = `Kargo entegrasyonu güncellendi.`;

            if (isDelivered) {
                if (order.status !== 'completed' && order.status !== 'cancelled') {
                    updateData.status = 'completed';
                    updateData.updatedAt = new Date();
                    statusChanged = true;
                    activityDetails = `Kargo teslim edildi olarak güncellendi (Durum: ${status || 'delivered'}). Sipariş durumu otomatik olarak Tamamlandı yapıldı.`;
                }
            } else {
                if (['pending', 'processing', 'baski', 'printing', 'ready', 'packed'].includes(order.status)) {
                    updateData.status = 'shipped';
                    updateData.updatedAt = new Date();
                    statusChanged = true;
                    activityDetails = `Kargo yola çıktı olarak güncellendi (Durum: ${status || 'Yola Çıktı'}). Sipariş durumu otomatik olarak Kargolandı yapıldı.`;
                }
            }

            // Generate print URL (Standardizing on what we think works or will work)
            if (shipmentId) {
                updateData.cargoLabelPdf = `kargoentegrator:${shipmentId}`;
            }

            await db.order.update({
                where: { id: order.id },
                data: updateData
            });

            // Log Activity
            await db.orderActivity.create({
                data: {
                    orderId: order.id,
                    author: 'Kargo Entegrator',
                    action: statusChanged ? 'STATUS_CHANGE' : 'WEBHOOK',
                    details: activityDetails
                }
            });

            // revalidatePath("/") // Commented out to prevent slow webhook responses
            return NextResponse.json({ success: true, message: "Order updated via Webhook" })
        } else {
            console.warn(`Kargo Webhook: Order not found for platform_id: ${platformId}`)
            return NextResponse.json({ message: "Order not found", platform_id: platformId }, { status: 200 })
        }

    } catch (error: any) {
        console.error("Kargo Webhook Error:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
