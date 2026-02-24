
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const orderId = 229
    console.log(`Checking Order #${orderId}...`)

    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
            activities: {
                orderBy: { timestamp: 'desc' }
            }
        }
    })

    if (!order) {
        console.log("Order not found.")
        return
    }

    console.log("Order Data:", JSON.stringify({
        id: order.id,
        status: order.status,
        updatedAt: order.updatedAt,
        barcode: order.barcode,
        source: order.source
    }, null, 2))

    console.log("\nActivity History:")
    order.activities.forEach(a => {
        console.log(`[${a.timestamp.toISOString()}] ${a.author}: ${a.action} - ${a.details}`)
    })
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
