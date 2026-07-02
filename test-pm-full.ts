import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function run() {
    const settings = await db.systemSetting.findMany();
    const pmUrl = settings.find(s => s.key === 'pm_url')?.value;
    const pmKey = settings.find(s => s.key === 'pm_key')?.value;

    if (!pmUrl || !pmKey) return console.log("Missing PM credentials");

    const cleanUrl = pmUrl.replace(/\/+$/, '');

    // Add aggressive query params to bypass defaults
    let response = await fetch(`${cleanUrl}/api/orders?limit=100&status=any&per_page=100`, {
        headers: { "X-API-Key": pmKey },
        cache: 'no-store'
    });

    if (response.status === 401 || response.status === 403) {
        response = await fetch(`${cleanUrl}/api/orders?limit=100&status=any&per_page=100`, {
            headers: { "Authorization": `Bearer ${pmKey}` },
            cache: 'no-store'
        })
    }

    if (!response.ok) {
        console.log("API Error:", response.status, response.statusText);
        return;
    }

    const pmOrders = await response.json();
    console.log(`Fetched ${pmOrders.length} orders from PM.`);

    pmOrders.forEach((o: any) => {
        console.log(`ID: ${o.id} | Source: ${o.source} | Status: ${o.status} | ExtID: ${o.external_id} | Name: ${o.recipient_name} | Date: ${o.created_at}`);
    });
}
run().finally(() => db.$disconnect());
