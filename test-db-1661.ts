import { db } from './lib/prisma';

async function main() {
    const order = await db.order.findUnique({
        where: { id: 1661 },
        select: { cargoBarcode: true, cargoLabelPdf: true, cargoTrackingNumber: true }
    });
    console.log(order);
}

main().catch(console.error);
