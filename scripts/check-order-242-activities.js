
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    const orderId = 242;
    const activities = await prisma.orderActivity.findMany({
        where: { orderId },
        orderBy: { timestamp: 'desc' }
    })

    console.log(`Activities for #${orderId}:`);
    console.log(JSON.stringify(activities, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
