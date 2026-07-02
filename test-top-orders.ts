import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function run() {
    const orders = await db.order.findMany({
        orderBy: { updatedAt: "desc" },
        take: 100,
        select: { id: true, source: true, status: true, updatedAt: true, customer: true }
    });

    const sourceCounts = orders.reduce((acc: any, o) => {
        const src = o.source || 'unknown';
        acc[src] = (acc[src] || 0) + 1;
        return acc;
    }, {});

    console.log("Top 100 recent orders by source:", sourceCounts);
}
run().finally(() => db.$disconnect());
