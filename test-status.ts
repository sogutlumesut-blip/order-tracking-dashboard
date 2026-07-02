import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function run() {
    const cols = await db.statusColumn.findMany();
    console.log("Status Columns:", cols);
}
run().finally(() => db.$disconnect());
