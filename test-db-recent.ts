import { db } from './lib/prisma';
async function run() {
    const orders = await db.order.findMany({
        where: { cargoLabelPdf: { startsWith: 'http' } },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { id: true, updatedAt: true, cargoTrackingNumber: true }
    });
    console.log(orders);
}
run();
