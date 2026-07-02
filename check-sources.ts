import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function run() {
    const summary = await db.order.groupBy({
        by: ['source'],
        _count: {
            id: true
        },
        _max: {
            date: true
        }
    });
    console.log("Order summary by source:");
    console.log(JSON.stringify(summary, null, 2));
    await db.$disconnect();
}
run();
