import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function run() {
    const orders = await db.order.findMany({
        where: { id: { in: [494, 495, 496, 160, 159, 145] } },
        select: { id: true, source: true, externalId: true, customer: true, barcode: true, date: true }
    });
    console.log(JSON.stringify(orders, null, 2));
}

run().finally(() => db.$disconnect());
