
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    const orders = await prisma.order.findMany({
        select: { id: true, status: true, barcode: true },
        take: 20,
        orderBy: { updatedAt: 'desc' }
    })
    console.log(JSON.stringify(orders, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
