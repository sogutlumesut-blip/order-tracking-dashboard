
import { db } from "../lib/prisma";

async function verifyKeys() {
    const settings = await db.systemSetting.findMany({
        where: { key: { in: ['wc_url', 'wc_key', 'wc_secret'] } }
    });

    const wcUrl = settings.find(s => s.key === 'wc_url')?.value;
    const wcKey = settings.find(s => s.key === 'wc_key')?.value;
    const wcSecret = settings.find(s => s.key === 'wc_secret')?.value;

    console.log(`URL: ${wcUrl}`);
    console.log(`Key: ${wcKey ? wcKey.substring(0, 5) + '...' : 'MISSING'}`);
    console.log(`Secret: ${wcSecret ? wcSecret.substring(0, 5) + '...' : 'MISSING'}`);

    if (wcUrl && wcKey && wcSecret) {
        const url = `${wcUrl}/wp-json/wc/v3/orders?per_page=1&consumer_key=${wcKey}&consumer_secret=${wcSecret}`;
        console.log(`Test URL: ${url}`);

        try {
            const res = await fetch(url, {
                headers: { "User-Agent": "Debugging Script" }
            });
            console.log(`Status: ${res.status}`);
            const text = await res.text();
            console.log(`Body Snippet: ${text.substring(0, 100)}`);
        } catch (e) {
            console.error("Fetch failed:", e);
        }
    }
}

verifyKeys();
