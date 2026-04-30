import { db } from './lib/prisma';
async function run() {
    const order = await db.order.findUnique({ where: { id: 1806 } });
    console.log(order);
}
run();
