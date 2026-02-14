
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
            if (barcode) updateData.cargoBarcode = barcode

            // Generate print URL (Standardizing on what we think works or will work)
            // If the user confirms a different URL, we will update this logic.
            // For now, let's stick to the pattern we are trying to fix:
            if (shipmentId) {
                updateData.cargoLabelPdf = `https://app.kargoentegrator.com/print/shipment/${shipmentId}`
            }

            await db.order.update({
                where: { id: order.id },
                data: updateData
            })

            // Log Activity
            await db.orderActivity.create({
                data: {
                    orderId: order.id,
                    author: 'Kargo Entegrator',
                    action: 'WEBHOOK',
                    details: `Kargo durumu güncellendi: ${status || 'Bilinmiyor'}. Takip No: ${trackingNumber || '-'}`
                }
            })

            revalidatePath("/")
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
