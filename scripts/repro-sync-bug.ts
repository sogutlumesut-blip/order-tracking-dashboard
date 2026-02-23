
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    // 1. Find a recent WC order
    const order = await prisma.order.findFirst({
        where: { barcode: { startsWith: 'WC-' } }
    })

    if (!order) {
        console.log("No WooCommerce order found to test with.")
        return
    }

    console.log(`Testing with Order #${order.id} (Barcode: ${order.barcode}, Current Status: ${order.status})`)

    // 2. Set status to 'draft' (simulating user action)
    console.log("Setting status to 'draft'...")
    await prisma.order.update({
        where: { id: order.id },
        data: { status: 'draft', updatedAt: new Date() }
    })

    let updated = await prisma.order.findUnique({ where: { id: order.id } })
    console.log(`Status in DB after local update: ${updated?.status}`)

    // 3. Simulate syncWooCommerceOrders preservation logic
    // We need to fetch statuses to get defaultStatus
    const statuses = await prisma.statusColumn.findMany({ orderBy: { order: 'asc' } })
    const incoming = statuses.find(s =>
        s.title.toLowerCase().includes("gelen") ||
        s.title.toLowerCase().includes("yeni") ||
        s.title.toLowerCase().includes("sipariş") ||
        s.id === "wc-pending" ||
        s.id === "pending"
    )
    const defaultStatus = incoming ? incoming.id : "pending"
    console.log(`Identified defaultStatus: ${defaultStatus}`)

    // Incoming mapped status from WC (e.g. WC 'processing' -> local defaultStatus)
    const incomingMappedStatus = defaultStatus

    console.log(`Simulating sync preservation logic...`)
    console.log(`existingOrder.status: ${updated?.status}`)
    console.log(`incomingMappedStatus: ${incomingMappedStatus}`)

    let finalStatus = incomingMappedStatus
    if (updated && updated.status !== defaultStatus && incomingMappedStatus === defaultStatus) {
        console.log("MATCH: Preservation logic should trigger.")
        finalStatus = updated.status
    } else {
        console.log("NO MATCH: Preservation logic skipped.")
    }

    console.log(`Final Calculated Status: ${finalStatus}`)

    // Result
    if (finalStatus === 'draft') {
        console.log("SUCCESS: Preservation logic works in isolation.")
    } else {
        console.log("FAILURE: Status would revert to " + finalStatus)
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect())
