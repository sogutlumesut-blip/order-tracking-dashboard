import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function run() {
    const order = await db.order.findFirst({
        where: { externalId: 'pm_2105' },
        include: { items: true }
    });
    console.log("Order pm_2105 in DB:", JSON.stringify(order, null, 2));
    await db.$disconnect();
}
run();
