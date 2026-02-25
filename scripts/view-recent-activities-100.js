
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    const activities = await prisma.orderActivity.findMany({
        take: 100,
        orderBy: { timestamp: 'desc' }
    })

    console.log(JSON.stringify(activities, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
