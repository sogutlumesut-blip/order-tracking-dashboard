
const { PrismaClient } = require('@prisma/client');

// User provided: psql 'postgresql://neondb_owner:npg_nFjfJSP83DwG@ep-steep-pine-ai4ztwmx-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
// Converted:
const connectionString = "postgresql://neondb_owner:npg_nFjfJSP83DwG@ep-steep-pine-ai4ztwmx-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require";

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: connectionString
        }
    }
});

async function check() {
    try {
        console.log("Connecting to NEW DB (Steep Pine)...");
        // const count = await prisma.order.count(); // Tables might not exist yet!
        // Just check connection by querying time
        const result = await prisma.$queryRaw`SELECT 1`;
        console.log(`Connection Successful! Result:`, result);
    } catch (e) {
        console.error("Connection Failed. Details:");
        console.error(e.message);
    } finally {
        await prisma.$disconnect();
    }
}

check();
