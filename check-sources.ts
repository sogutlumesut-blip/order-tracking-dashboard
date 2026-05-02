import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function run() {
    const pmOrders = await db.order.findMany({ where: { status: "pending_woo" } });
    console.log("Sources in pending_woo:", [...new Set(pmOrders.map(o => o.source))]);
    await db.$disconnect();
}
run();
