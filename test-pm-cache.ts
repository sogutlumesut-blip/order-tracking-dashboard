import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function run() {
    const settings = await db.systemSetting.findMany();
    const pmUrl = settings.find(s => s.key === 'pm_url')?.value;
    const pmKey = settings.find(s => s.key === 'pm_key')?.value;

    if (!pmUrl || !pmKey) return console.log("Missing PM credentials");

    const cleanUrl = pmUrl.replace(/\/+$/, '');
    const ts = Date.now();
    console.log("Fetching from:", `${cleanUrl}/api/orders?t=${ts}`);

    let response = await fetch(`${cleanUrl}/api/orders?t=${ts}`, {
        headers: { "X-API-Key": pmKey }
    });

    if (response.status === 401 || response.status === 403) {
        response = await fetch(`${cleanUrl}/api/orders?t=${ts}`, {
            headers: { "Authorization": `Bearer ${pmKey}` }
        })
    }

    if (!response.ok) {
        console.log("API Error:", response.status, response.statusText);
        return;
    }

    const pmOrders = await response.json();
    console.log(`Fetched ${pmOrders.length} orders from PM.`);
}
run().finally(() => db.$disconnect());
