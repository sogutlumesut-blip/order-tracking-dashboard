import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    try {
        const orderId = 3419;
        console.log(`Checking order #${orderId} details...`);
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                activities: true,
                comments: true
            }
        });

        if (!order) {
            console.log("Order not found.");
        } else {
            console.log("Order status:", order.status);
            console.log("Activities count:", order.activities.length);
            order.activities.forEach(a => {
                console.log(`  Activity: ${a.timestamp.toISOString()} | ${a.author} | ${a.action} | ${a.details}`);
            });
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
