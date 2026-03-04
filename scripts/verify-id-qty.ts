import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    try {
        console.log("Checking for WooCommerce external IDs in database...");
        const wooOrders = await prisma.order.findMany({
            where: { source: 'woo' },
            take: 5,
            select: {
                id: true,
                externalId: true,
                source: true,
                customer: true
            }
        });

        if (wooOrders.length === 0) {
            console.log("No orders with source 'woo' found yet. Please run a sync.");
        } else {
            console.table(wooOrders);
        }

        const items = await prisma.orderItem.findMany({
            take: 5,
            select: {
                name: true,
                quantity: true,
                orderId: true
            }
        });
        console.log("\nSample Order Items with Quantities:");
        console.table(items);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
