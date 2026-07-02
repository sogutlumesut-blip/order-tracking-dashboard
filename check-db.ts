import { db } from "./lib/prisma";

async function run() {
    const tables: any = await db.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`;
    console.log("Database Tables:");
    console.log(tables.map((t: any) => t.table_name));
}

run().catch(console.error);
