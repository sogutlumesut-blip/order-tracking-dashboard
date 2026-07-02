import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    try {
        const orderId = 3419;
        console.log(`Comparing sequential vs parallel Prisma queries for Order #${orderId}...`);
        
        // Warm up connection
        await prisma.order.findUnique({ where: { id: orderId } });

        // Test 1: Sequential (current approach)
        console.log("\n--- Testing Sequential Query ---");
        for (let i = 1; i <= 3; i++) {
            const start = Date.now();
            const order = await prisma.order.findUnique({
                where: { id: orderId },
                include: {
                    comments: {
                        include: { author: { select: { name: true } } },
                        orderBy: { timestamp: "asc" }
                    },
                    activities: {
                        orderBy: { timestamp: "desc" },
                        take: 20
                    }
                }
            });
            const duration = Date.now() - start;
            console.log(`Sequential Run #${i}: took ${duration}ms`);
        }

        // Test 2: Parallel Promise.all (optimized approach)
        console.log("\n--- Testing Parallel Query ---");
        for (let i = 1; i <= 3; i++) {
            const start = Date.now();
            const [order, comments, activities] = await Promise.all([
                prisma.order.findUnique({
                    where: { id: orderId }
                }),
                prisma.comment.findMany({
                    where: { orderId },
                    include: { author: { select: { name: true } } },
                    orderBy: { timestamp: "asc" }
                }),
                prisma.orderActivity.findMany({
                    where: { orderId },
                    orderBy: { timestamp: "desc" },
                    take: 20
                })
            ]);
            const duration = Date.now() - start;
            console.log(`Parallel Run #${i}: took ${duration}ms (Activities: ${activities.length})`);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
