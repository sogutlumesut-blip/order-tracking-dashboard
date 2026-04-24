import { db } from './lib/prisma'
import { createKargoEntegratorShipment } from './lib/kargo-entegrator-api'

async function run() {
    const orderId = 1665; // Another order to test
    const order = await db.order.findUnique({
        where: { id: orderId },
        include: { items: true }
    });

    if (!order) return;

    console.log(`Running createKargoEntegratorShipment for ${orderId}...`);
    const start = Date.now();
    const res = await createKargoEntegratorShipment(order, order.items);
    const end = Date.now();
    
    console.log(`Result:`, res);
    console.log(`Total Time: ${(end - start)/1000}s`);
}

run().catch(console.error)
