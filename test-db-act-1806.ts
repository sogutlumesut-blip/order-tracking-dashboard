import { db } from './lib/prisma';
async function run() {
    const activities = await db.orderActivity.findMany({ where: { orderId: 1806 }, orderBy: { id: 'desc' }, take: 10 });
    console.log(activities);
}
run();
