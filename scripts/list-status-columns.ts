import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    try {
        console.log("Listing status columns...");
        const cols = await prisma.statusColumn.findMany({
            orderBy: { order: 'asc' }
        });
        console.table(cols);
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
