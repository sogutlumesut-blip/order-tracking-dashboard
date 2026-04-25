import { db } from './lib/prisma'
async function run() {
    const order = await db.order.findUnique({ where: { id: 1755 }, select: { cargoBarcode: true, cargoTrackingNumber: true, cargoLabelPdf: true } });
    console.log(order);
}
run().catch(console.error)
