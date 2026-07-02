import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    try {
        const orderId = 3421;
        console.log(`Checking order #${orderId} details...`);
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                activities: true,
                comments: true,
                items: true
            }
        });

        if (!order) {
            console.log("Order not found.");
        } else {
            console.log("Order status:", order.status);
            console.log("Order customer:", order.customer);
            console.log("Activities count:", order.activities.length);
            order.activities.forEach(a => {
                console.log(`  Activity: ${a.timestamp.toISOString()} | ${a.author} | ${a.action} | ${a.details}`);
            });
            console.log("Comments count:", order.comments.length);
            console.log("Items count:", order.items.length);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
