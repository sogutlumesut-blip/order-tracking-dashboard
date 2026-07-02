import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    try {
        console.log("Listing recent 10 orders with their activities count...");
        const orders = await prisma.order.findMany({
            orderBy: { updatedAt: 'desc' },
            take: 10,
            include: {
                activities: true
            }
        });

        orders.forEach(o => {
            console.log(`Order #${o.id} | extId: ${o.externalId} | status: ${o.status} | customer: ${o.customer.replace(/\n/g, ' ')} | activities: ${o.activities.length}`);
            o.activities.forEach(a => {
                console.log(`  - Log: ${a.timestamp.toISOString()} | ${a.author} | ${a.action} | ${a.details}`);
            });
        });

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
