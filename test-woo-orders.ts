import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function run() {
    const wooCount = await db.order.count({ where: { source: 'woo' } });
    console.log("Total Woo Orders:", wooCount);

    const statuses = await db.order.groupBy({
        by: ['status'],
        where: { source: 'woo' },
        _count: true
    });
    console.log("Woo Orders by Status:", statuses);
}
run().finally(() => db.$disconnect());
