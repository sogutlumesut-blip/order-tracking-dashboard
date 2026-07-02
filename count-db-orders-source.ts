import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function run() {
    const total = await db.order.count();
    console.log("Total orders in DB:", total);
    const sources = ['WooCommerce', 'Etsy', 'PrintMarkt', null];
    for (const source of sources) {
        const count = await db.order.count({ where: { source } });
        console.log(`- Source ${source}: ${count}`);
    }
    await db.$disconnect();
}
run();
