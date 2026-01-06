import { NextResponse } from "next/server"
import { db } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function POST(req: Request) {
    try {
        const text = await req.text()
        console.log("--- CARGO WEBHOOK RECEIVED ---")
        console.log(text)
        console.log("------------------------------")

        if (!text) {
            return NextResponse.json({ message: "Empty body" }, { status: 400 })
        }

        const body = JSON.parse(text)

        // DEBUG: Save payload to DB to inspect in UI
        await db.systemSetting.upsert({
            where: { key: 'last_cargo_webhook' },
            create: { key: 'last_cargo_webhook', value: JSON.stringify(body, null, 2) },
            update: { value: JSON.stringify(body, null, 2) }
        })

        // Strategy: Look for Order ID and Cargo Data in various possible locations
        // 1. Order ID
        let orderId = body.order_id || body.id

        // 2. Barcode
        let barcode = body.barcode || body.cargo_barcode || body.tracking_number || null
        let trackingNumber = body.tracking_number || body.cargo_tracking_number || null

        // Speculation: Maybe it returns the full WC Order structure?
        if (body.meta_data) {
            const bc = body.meta_data.find((m: any) => m.key === '_gcargo_barcode_exposed' || m.key === 'barcode')
            if (bc) barcode = bc.value

            const tn = body.meta_data.find((m: any) => m.key === '_gcargo_tracking_exposed' || m.key === 'tracking_number')
            if (tn) trackingNumber = tn.value
        }

        if (!orderId) {
            return NextResponse.json({ message: "Order ID not found in payload" }, { status: 400 })
        }

        if (!barcode && !trackingNumber) {
            return NextResponse.json({ message: "No cargo data found to update" }, { status: 200 })
        }

        // Update Database
        // We link via 'barcode' field which stores "WC-{id}" or we might need to search by ID field if we stored it differently
        // System uses `barcode: WC-{id}` as the unique key for WC orders.

        // Find internal order first to be sure
        const existingOrder = await db.order.findFirst({
            where: { barcode: `WC-${orderId}` }
        })

        if (!existingOrder) {
            console.log(`Order WC-${orderId} not found in DB. Skipping update.`)
            return NextResponse.json({ message: "Order not found in system" }, { status: 404 })
        }

        await db.order.update({
            where: { id: existingOrder.id },
            data: {
                cargoBarcode: barcode || undefined,
                cargoTrackingNumber: trackingNumber || undefined,
                // Optional: Update status to 'shipped' / 'kargolandı' if webhook implies it?
                // For now, let's just save the data.
            }
        })

        console.log(`Order ${existingOrder.id} updated with cargo data: ${barcode} / ${trackingNumber}`)

        revalidatePath("/")
        return NextResponse.json({ success: true, message: "Cargo data updated" })

    } catch (error: any) {
        console.error("Cargo Webhook Error:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
