import { db } from './lib/prisma'
async function run() {
    const orders = await db.order.findMany({ where: { source: 'PrintMarkt' }, select: { id: true, paymentMethod: true }, take: 10, orderBy: { id: 'desc' } });
    console.log(orders);
}
run().catch(console.error)
