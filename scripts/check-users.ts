import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    try {
        console.log("Checking Users in database...");
        const users = await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                name: true,
                role: true
            }
        });

        console.table(users);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
