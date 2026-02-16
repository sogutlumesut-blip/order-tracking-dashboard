
import { db } from "../lib/prisma";

async function fixKeys() {
    const settings = await db.systemSetting.findMany({
        where: { key: { in: ['wc_key'] } }
    });

    const val = settings.find(s => s.key === 'wc_key')?.value || "";

    // Check if it's the concatenated string we expect
    if (val.includes("ck_") && val.includes("cs_")) {
        console.log("Found concatenated key string. Attempting to split...");

        // Remove extra spaces and split
        const parts = val.replace(/\s+/g, ' ').trim().split(' ');

        let validKey = "";
        let validSecret = "";

        parts.forEach(p => {
            if (p.startsWith("ck_")) validKey = p;
            if (p.startsWith("cs_")) validSecret = p;
        });

        if (validKey && validSecret) {
            console.log(`Detected Key: ${validKey}`);
            console.log(`Detected Secret: ${validSecret}`);

            await db.systemSetting.update({
                where: { key: 'wc_key' },
                data: { value: validKey }
            });

            await db.systemSetting.update({
                where: { key: 'wc_secret' },
                data: { value: validSecret }
            });

            console.log("Keys successfully updated in DB!");
        } else {
            console.error("Could not parse key/secret correctly.");
        }
    } else {
        console.log("Keys do not appear to be concatenated or are missing prefixes.");
    }
}

fixKeys();
