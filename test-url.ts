import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function run() {
    const settings = await db.systemSetting.findMany({
        where: { key: { in: ['wc_url', 'pm_url'] } }
    });
    console.log(settings);
}
run().finally(() => db.$disconnect());
