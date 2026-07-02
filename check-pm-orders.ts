import { db } from "./lib/prisma";

async function run() {
    const orders = await db.order.findMany({
        where: { source: 'PrintMarkt' },
        orderBy: { id: 'desc' },
        take: 10
    });
    console.log("Last 10 PrintMarkt orders in DB (by ID desc):");
    orders.forEach(o => {
        console.log(`ID: ${o.id} | ExternalID: ${o.externalId} | Customer: ${o.customer.replace(/\n/g, ' ')} | Date: ${o.date.toISOString()} | CreatedAt: ${o.createdAt.toISOString()} | Status: ${o.status}`);
    });
}

run().catch(console.error);
