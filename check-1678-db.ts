import { db } from './lib/prisma'

async function run() {
    const order = await db.order.findUnique({ where: { id: 1678 } });
    console.log(order?.cargoBarcode);
    console.log(order?.cargoLabelPdf);
}

run().catch(console.error)
