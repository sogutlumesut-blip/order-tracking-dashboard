import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function run() {
    console.log("Searching for any PrintMarkt orders containing ETSY payload...");
    
    // Find PrintMarkt orders that contain ETSY in the external ID, or the exact test ones
    const staleOrders = await db.order.findMany({
        where: {
            OR: [
                { externalId: { contains: 'ETSY' } },
                { externalId: { startsWith: 'pm_13' } } // The original 3 dummy ones from the API
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
