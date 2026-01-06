import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
    const orders = await db.order.findMany({
        take: 10,
        orderBy: { id: 'desc' }
    })

    console.log("--- Recent Orders City Check ---")
    orders.forEach(o => {
        console.log(`Order #${o.id} (${o.barcode}) - City: "${o.city}" | Address: "${o.address?.substring(0, 20)}..."`)
    })
}

main()
    .finally(async () => {
        await db.$disconnect()
    })
