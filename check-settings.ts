import { db } from "./lib/prisma";

async function run() {
    const settings = await db.systemSetting.findMany();
    settings.forEach(s => console.log(`${s.key}: ${s.value}`));
}

run().catch(console.error);
