import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function run() {
    const settings = await db.systemSetting.findMany({
        where: { key: { startsWith: 'pm_' } }
    });
    console.log(settings);
}
run().finally(() => db.$disconnect());
