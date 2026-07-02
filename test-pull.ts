import { syncPrintMarktOrders } from './app/actions'
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function run() {
    console.log("Triggering sync...");
    await syncPrintMarktOrders();
    console.log("Sync finished. Checking DB...");
    const orders = await db.order.findMany({
         where: { source: 'printmarkt' },
         orderBy: { date: 'desc' },
         take: 3
    });
    console.log("Found:", orders.map(o => ({id: o.id, customer: o.customer, externalId: o.externalId, file: o.customFileUrl})));
}

run().catch(console.error).finally(() => db.$disconnect());
