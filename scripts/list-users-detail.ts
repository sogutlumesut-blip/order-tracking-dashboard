import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    try {
        console.log("Listing all users...");
        const users = await prisma.user.findMany();
        console.table(users.map(u => ({
            id: u.id,
            username: u.username,
            name: u.name,
            role: u.role,
            allowedStatuses: u.allowedStatuses
        })));
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
