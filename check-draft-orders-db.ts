import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function run() {
    const orders = await db.order.findMany({
        where: {
            externalId: {
                in: ['pm_2124', 'pm_2123']
            }
        }
    });
    console.log("Draft orders in DB count:", orders.length);
    orders.forEach(o => {
        console.log(`ID: ${o.id} | ExtID: ${o.externalId} | Customer: ${o.customer} | Status: ${o.status}`);
    });
    await db.$disconnect();
}
run();
