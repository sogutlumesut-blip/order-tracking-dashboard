
import { db } from "../lib/prisma";

async function dumpSettings() {
    console.log("Dumping System Settings...");
    const settings = await db.systemSetting.findMany();
    settings.forEach(s => {
        console.log(`[${s.key}]: ${s.value.substring(0, 50)}...`);
    });
    await db.$disconnect();
    process.exit(0);
}

dumpSettings().catch(err => {
    console.error(err);
    process.exit(1);
});
