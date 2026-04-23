import { db } from "./lib/prisma";

async function run() {
    const orders = await db.order.findMany({
        take: 3,
        orderBy: { updatedAt: 'desc' },
        select: { id: true, cargoBarcode: true, cargoTrackingNumber: true, cargoLabelPdf: true, updatedAt: true }
    });
    console.log("Recent Orders:", orders);
}

run().catch(console.error);
