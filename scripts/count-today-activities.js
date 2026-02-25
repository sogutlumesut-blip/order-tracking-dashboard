
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const count = await prisma.orderActivity.count({
        where: {
            timestamp: { gte: today }
        }
    });

    console.log(`Total activities today: ${count}`);

    const latest = await prisma.orderActivity.findMany({
        take: 5,
        orderBy: { timestamp: 'desc' }
    });
    console.log("Latest 5 activities:");
    console.log(JSON.stringify(latest, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect())
