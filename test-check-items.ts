import { db } from './lib/prisma';
async function run() {
    const order = await db.order.findFirst({ where: { customer: { contains: "Şule nur doğru" } }, include: { items: true } });
    console.log(JSON.stringify(order?.items, null, 2));
}
run();
