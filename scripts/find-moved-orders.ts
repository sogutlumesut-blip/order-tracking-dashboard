import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    try {
        console.log("Checking all activities for STATUS_CHANGE today...");
        const today = new Date();
        today.setHours(0,0,0,0);

        const activities = await prisma.orderActivity.findMany({
            where: {
                timestamp: { gte: today },
                action: "STATUS_CHANGE"
            },
            orderBy: { timestamp: 'desc' }
        });

        console.log(`Found ${activities.length} status change activities today.`);
        activities.forEach(a => {
            console.log(`Log: ${a.timestamp.toISOString()} | Order #${a.orderId} | Author: ${a.author} | Details: ${a.details}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
