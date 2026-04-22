import { db } from "./lib/prisma";

async function run() {
    const orders = await db.order.findMany({ 
        where: { cargoTrackingNumber: { not: null } },
        select: { id: true, city: true, address: true, cargoTrackingNumber: true, updatedAt: true },
        take: 5,
        orderBy: { id: 'desc' }
    });
    console.log("Successful Orders:", orders);
}

run().catch(console.error);
