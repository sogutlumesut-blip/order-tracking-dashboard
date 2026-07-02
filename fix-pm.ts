import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function run() {
    console.log("Emptying printmarkt orders again to run a full clean sync process with new code later.");
    const deleted = await db.order.deleteMany({
        where: { source: 'printmarkt' }
    });
    console.log("Deleted count:", deleted.count);
}
run().finally(() => db.$disconnect());
