
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activities = await prisma.orderActivity.findMany({
        where: {
            timestamp: { gte: today }
        },
        orderBy: { timestamp: 'desc' }
    });

    console.log(`Found ${activities.length} activities today:`);
    console.log(JSON.stringify(activities, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect())
