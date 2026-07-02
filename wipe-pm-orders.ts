import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function run() {
    console.log("Wiping all PrintMarkt orders to prepare for clean sync...");
    const result = await db.order.deleteMany({
        where: { source: 'PrintMarkt' }
    });
    console.log(`Deleted ${result.count} stale PrintMarkt orders.`);
}
run().finally(() => db.$disconnect());
