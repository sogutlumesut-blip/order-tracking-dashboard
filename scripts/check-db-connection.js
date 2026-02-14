
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        console.log("Connecting to DB...");
        const count = await prisma.order.count();
        console.log(`Connection Successful. Order count: ${count}`);
    } catch (e) {
        console.error("DB Connection Failed:", e);
    } finally {
        await prisma.$disconnect();
    }
}

check();
