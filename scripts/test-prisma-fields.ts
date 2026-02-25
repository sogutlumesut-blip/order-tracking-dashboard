
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log("Testing Prisma fields...")

    // Find a test order or create dummy
    let order = await prisma.order.findFirst()

    if (!order) {
        console.log("No orders found, skipping test.")
        return
    }

    console.log(`Original Order #${order.id} Tax: ${order.taxNumber || 'None'}`)

    // Update with dummy tax info
    const updated = await prisma.order.update({
        where: { id: order.id },
        data: {
            taxNumber: "12345678901",
            taxOffice: "Test Office",
            invoiceStatus: "draft"
        } as any // Cast to any to bypass local TS errors during test
    })

    console.log(`Updated Order #${updated.id} Tax: ${updated.taxNumber}`)

    if (updated.taxNumber === "12345678901") {
        console.log("PRISMA TEST SUCCESS: Billing fields are working in DB!")
    } else {
        console.log("PRISMA TEST FAILED!")
    }
}

main().catch(console.error).finally(() => prisma.$disconnect())
