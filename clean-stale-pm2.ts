import { PrismaClient } from '@prisma/client'
import { syncPrintMarktOrders } from './app/actions'
const db = new PrismaClient()

async function run() {
    console.log("Searching for old API orders by ID...");

    // Find PrintMarkt orders that match the screenshot IDs precisely
    const staleOrders = await db.order.findMany({
        where: {
            id: { in: [726, 724, 722, 138, 135, 134] }
        }
    });

    console.log(`Found ${staleOrders.length} stale orders to delete.`);

    if (staleOrders.length > 0) {
        const result = await db.order.deleteMany({
            where: { id: { in: staleOrders.map(o => o.id) } }
        });
        console.log(`Deleted ${result.count} stale orders.`);
    }

    console.log("Triggering fresh PrintMarkt sync...");
    const syncResult = await syncPrintMarktOrders();
    console.log("Sync Result:", syncResult);
}
run().finally(() => db.$disconnect());
