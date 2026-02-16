
import { db } from "../lib/prisma";

async function inspectKeys() {
    const settings = await db.systemSetting.findMany({
        where: { key: { in: ['wc_key', 'wc_secret'] } }
    });

    const wcKey = settings.find(s => s.key === 'wc_key')?.value || "";
    const wcSecret = settings.find(s => s.key === 'wc_secret')?.value || "";

    console.log("--- KEY INSPECTION ---");
    console.log(`Key Length: ${wcKey.length}`);
    console.log(`Key Content: '${wcKey.substring(0, 10)}...${wcKey.substring(wcKey.length - 10)}'`);
    console.log(`Does Key contain space? ${wcKey.includes(" ")}`);
    console.log(`Does Key contain 'cs_'? ${wcKey.includes("cs_")}`);

    console.log("\n--- SECRET INSPECTION ---");
    console.log(`Secret Length: ${wcSecret.length}`);
    console.log(`Secret Content: '${wcSecret.substring(0, 10)}...${wcSecret.substring(wcSecret.length - 10)}'`);
    console.log(`Does Secret contain 'ck_'? ${wcSecret.includes("ck_")}`);
}

inspectKeys();
