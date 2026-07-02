import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function run() {
    console.log("Searching for old API orders by ID and ExternalID...");
    
    // Find PrintMarkt orders that match both the DB IDs or the known fake Etsy ExtIDs
    // IDs from screenshot: 726, 724
    // Known fake PM Etsy ExtIDs: ETSY-3998476021, ETSY-3998282837, ETSY-3995326608
    const staleOrders = await db.order.findMany({
        where: {
            OR: [
                { id: { in: [726, 724, 722] } },
                { externalId: { in: ['pm_ETSY-3998476021', 'pm_ETSY-3998282837', 'pm_ETSY-3995326608', 'pm_138', 'pm_135', 'pm_134'] } }
            ]
        }
    });

    console.log(`Found ${staleOrders.length} stale orders to delete.`);

    if (staleOrders.length > 0) {
        staleOrders.forEach(o => console.log(`- Deleting ID: ${o.id} | ExtID: ${o.externalId} | Customer: ${o.customer}`));
        const result = await db.order.deleteMany({
            where: { id: { in: staleOrders.map(o => o.id) } }
        });
        console.log(`Deleted ${result.count} stale orders.`);
    }

}
run().finally(() => db.$disconnect());
