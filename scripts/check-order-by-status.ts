import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    try {
        console.log("Checking all orders with status 'Approved'...");
        const orders = await prisma.order.findMany({
            where: { status: 'Approved' },
            include: {
                activities: {
                    orderBy: { timestamp: 'desc' }
                }
            }
        });

        console.log(`Found ${orders.length} orders with status 'Approved'.`);
        orders.forEach(o => {
            console.log(`Order #${o.id} | extId: ${o.externalId} | customer: ${o.customer.replace(/\n/g, ' ')} | updatedAt: ${o.updatedAt.toISOString()} | activities: ${o.activities.length}`);
            o.activities.forEach(a => {
                console.log(`  - Log: ${a.timestamp.toISOString()} | ${a.author} | Details: ${a.details}`);
            });
        });

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
