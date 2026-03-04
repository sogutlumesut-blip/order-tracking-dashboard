import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    try {
        const orderId = 290;
        console.log(`Checking activity logs for Order #${orderId}...`);
        const activities = await prisma.orderActivity.findMany({
            where: { orderId: orderId },
            orderBy: { timestamp: 'desc' },
            take: 20
        });

        if (activities.length === 0) {
            console.log("No activities found.");
        } else {
            console.table(activities);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
