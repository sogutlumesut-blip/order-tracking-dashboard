import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function run() {
    const o109997 = await db.order.findFirst({
        where: { barcode: 'WC-109997' },
        include: { activities: true }
    });
    
    if (o109997) {
        console.log("Order 109997 Details:");
        console.log(`  ID: ${o109997.id}`);
        console.log(`  Status: ${o109997.status}`);
        console.log(`  CargoBarcode: ${o109997.cargoBarcode}`);
        console.log(`  CargoTracking: ${o109997.cargoTrackingNumber}`);
        console.log(`  CreatedAt: ${o109997.createdAt}`);
        console.log(`  Date (WC): ${o109997.date}`);
        console.log("  Activities:");
        o109997.activities.forEach(act => {
            console.log(`    [${act.timestamp}] ${act.author}: [${act.action}] ${act.details}`);
        });
    } else {
        console.log("Order 109997 not found.");
    }
}
run().finally(() => db.$disconnect());
