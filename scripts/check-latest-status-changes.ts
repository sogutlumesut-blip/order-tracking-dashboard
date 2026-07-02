import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    try {
        console.log("Checking orders updated in the last 30 minutes...");
        const halfHourAgo = new Date(Date.now() - 30 * 60 * 1000);
        const orders = await prisma.order.findMany({
            where: {
                updatedAt: {
                    gte: halfHourAgo
                }
            },
            orderBy: { updatedAt: 'desc' }
        });

        if (orders.length === 0) {
            console.log("No orders updated in the last 30 minutes.");
        } else {
            console.table(orders.map(o => ({
                id: o.id,
                externalId: o.externalId,
                customer: o.customer.replace(/\n/g, ' '),
                status: o.status,
                updatedAt: o.updatedAt.toISOString()
            })));
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
