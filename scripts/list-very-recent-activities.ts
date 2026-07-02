import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    try {
        console.log("Checking activities created in the last 30 minutes...");
        const halfHourAgo = new Date(Date.now() - 30 * 60 * 1000);
        const activities = await prisma.orderActivity.findMany({
            where: {
                timestamp: {
                    gte: halfHourAgo
                }
            },
            orderBy: { timestamp: 'desc' }
        });

        if (activities.length === 0) {
            console.log("No activities found in the last 30 minutes.");
        } else {
            console.table(activities.map(a => ({
                id: a.id,
                orderId: a.orderId,
                author: a.author,
                action: a.action,
                details: a.details,
                timestamp: a.timestamp.toISOString()
            })));
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
