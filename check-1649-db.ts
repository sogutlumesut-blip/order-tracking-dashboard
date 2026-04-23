import { db } from "./lib/prisma";

async function run() {
    const order = await db.order.findUnique({
        where: { id: 1649 },
        select: { id: true, cargoBarcode: true, cargoTrackingNumber: true, cargoLabelPdf: true, updatedAt: true }
    });
    console.log("Order 1649:", order);
}

run().catch(console.error);
