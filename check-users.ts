import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function run() {
    const users = await db.user.findMany({ select: { id: true, allowedStatuses: true } });
    console.log(users);
    await db.$disconnect();
}
run();
