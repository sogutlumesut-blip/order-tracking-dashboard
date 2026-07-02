import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function run() {
    console.log("Cleaning up old PrintMarkt Etsy drafts...");
    
    // Find PrintMarkt orders that actually belong to Etsy
    const staleOrders = await db.order.findMany({
        where: {
            source: 'PrintMarkt',
            OR: [
                { externalId: { startsWith: 'pm_13' } }, // e.g. pm_138, pm_135, pm_134
                { customer: { in: ['Antonio Davis', 'Sara Almeida', 'Sarah Cuneo', 'Jeanne Cotter', 'Sheridan Weber'] } }
            ]
        }
    });

    console.log(`Found ${staleOrders.length} stale orders to delete:`);
    staleOrders.forEach(o => console.log(`- ID: ${o.id} | ExtID: ${o.externalId} | Customer: ${o.customer}`));

    if (staleOrders.length > 0) {
        const result = await db.order.deleteMany({
            where: { id: { in: staleOrders.map(o => o.id) } }
        });
        console.log(`Deleted ${result.count} stale orders.`);
    } else {
        console.log("No stale API orders found.");
    }
}
run().finally(() => db.$disconnect());
