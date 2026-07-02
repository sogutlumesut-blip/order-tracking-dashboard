import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function run() {
    const settings = await db.systemSetting.findMany();
    const pmUrl = settings.find(s => s.key === 'pm_url')?.value;
    const pmKey = settings.find(s => s.key === 'pm_key')?.value;

    if (!pmUrl || !pmKey) {
        console.error("PrintMarkt settings missing!");
        return;
    }

    let cleanUrl = pmUrl.replace(/\/+$/, '');
    let fetchUrl = `${cleanUrl}/api/orders?_t=${Date.now()}`;
    
    console.log("Fetching from:", fetchUrl);
    const res = await fetch(fetchUrl, {
        headers: { "X-API-Key": pmKey }
    });
    
    if (!res.ok) {
        console.error("Fetch failed:", res.status);
        return;
    }

    const orders = await res.json();
    console.log(`Fetched ${orders.length} orders. Top 5:`);
    orders.slice(0, 5).forEach((o: any) => {
        console.log(`ID: ${o.id}, Status: ${o.status}, CreatedAt: ${o.created_at}, Recipient: ${o.recipient_name}, Source: ${o.source}`);
    });
}

run().catch(console.error).finally(() => db.$disconnect());
