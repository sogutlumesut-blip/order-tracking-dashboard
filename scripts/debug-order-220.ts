
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const orderId = 220;
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true }
    })

    if (!order) {
        console.log(`Order #${orderId} not found.`)
        const recent = await prisma.order.findMany({
            orderBy: { updatedAt: 'desc' },
            take: 5
        })
        console.log('Most recent orders:', JSON.stringify(recent, null, 2))
        return
    }

    console.log('Order Details:', JSON.stringify({
        id: order.id,
        customer: order.customer,
        status: order.status,
        barcode: order.barcode,
        updatedAt: order.updatedAt,
        source: order.source
    }, null, 2))

    const statuses = await prisma.statusColumn.findMany({ orderBy: { order: 'asc' } })
    console.log('All Statuses:', JSON.stringify(statuses, null, 2))

    // Simulation of defaultStatus logic
    const incoming = statuses.find(s =>
        s.title.toLowerCase().includes("gelen") ||
        s.title.toLowerCase().includes("yeni") ||
        s.title.toLowerCase().includes("sipariş") ||
        s.id === "wc-pending" ||
        s.id === "pending"
    )
    console.log('Detected defaultStatus:', incoming ? incoming.id : 'NONE')
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect())
