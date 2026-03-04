import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    try {
        console.log("Checking ALL activities for March 2, 2026...");
        const startOfDay = new Date('2026-03-02T00:00:00Z');
        const activities = await prisma.orderActivity.findMany({
            where: {
                timestamp: {
                    gte: startOfDay
                }
            },
            orderBy: { timestamp: 'desc' },
            take: 50
        });

        if (activities.length === 0) {
            console.log("No activities found for today.");
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
