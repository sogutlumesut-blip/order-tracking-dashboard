const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function run() {
    console.log("Checking DB for PM orders...");
    const orders = await db.order.findMany({
         where: { source: 'printmarkt' },
         orderBy: { date: 'desc' },
         take: 3
    });
    console.log("Found:", orders.map(o => ({id: o.id, customer: o.customer, externalId: o.externalId, file: o.customFileUrl})));
}

run().catch(console.error).finally(() => db.$disconnect());
