import { db } from './lib/prisma'

async function run() {
    const orders = await db.order.findMany({
        take: 1,
        omit: {
            cargoLabelPdf: true
        }
    });
    console.log(orders[0]);
}

run().catch(console.error)
