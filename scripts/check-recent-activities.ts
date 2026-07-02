import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    try {
        console.log("Checking recent 20 activities...");
        const activities = await prisma.orderActivity.findMany({
            orderBy: { timestamp: 'desc' },
            take: 20
        });

        if (activities.length === 0) {
            console.log("No activities found.");
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
