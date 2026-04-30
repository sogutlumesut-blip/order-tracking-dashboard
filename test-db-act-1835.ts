import { db } from './lib/prisma';
async function run() {
    const act = await db.orderActivity.findMany({ where: { orderId: 1835 }, orderBy: { id: 'desc' }, take: 10 });
    console.log(act);
}
run();
