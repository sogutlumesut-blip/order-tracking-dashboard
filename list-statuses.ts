import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function run() {
    const statuses = await db.statusColumn.findMany({ orderBy: { order: 'asc' } });
    console.log(statuses);
    await db.$disconnect();
}
run();
