import { db } from "./lib/prisma";

async function run() {
    const settings = await db.systemSetting.findMany({
        where: { key: { startsWith: 'dhl_' } }
    });
    console.log("DHL Settings in DB:", settings);
}

run().catch(console.error);
