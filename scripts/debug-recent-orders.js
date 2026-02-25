
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    // Check order 220 or any recent order that might be tested
    const orders = await prisma.order.findMany({
        take: 5,
        orderBy: { updatedAt: 'desc' },
        include: { activities: true }
    })

    console.log(JSON.stringify(orders, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
