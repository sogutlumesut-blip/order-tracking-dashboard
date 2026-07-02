import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function run() {
    const orders = await db.order.findMany({
        where: { status: 'pending_pm' },
        orderBy: { date: 'desc' }
    });
    console.log(`Total pending_pm orders in DB: ${orders.length}`);
    orders.forEach((o, index) => {
        console.log(`${index + 1}. ID: ${o.id} | ExtID: ${o.externalId} | Customer: ${o.customer} | Date: ${o.date} | Source: ${o.source}`);
    });
    await db.$disconnect();
}
run();
