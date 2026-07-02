import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function run() {
    const settings = await db.systemSetting.findMany();
    const wcUrl = settings.find(s => s.key === 'wc_url')?.value;
    const wcKey = settings.find(s => s.key === 'wc_key')?.value;
    const wcSecret = settings.find(s => s.key === 'wc_secret')?.value;

    if (!wcUrl || !wcKey || !wcSecret) return console.log("Missing WC credentials");

    const cleanUrl = wcUrl.replace(/\/+$/, '');
    const authString = Buffer.from(`${wcKey}:${wcSecret}`).toString('base64');

    console.log("Fetching raw WooCommerce orders...");
    const response = await fetch(`${cleanUrl}/wp-json/wc/v3/orders?per_page=10&orderby=date&order=desc`, {
        headers: { "Authorization": `Basic ${authString}` },
        cache: 'no-store'
    });

    if (!response.ok) {
        console.log("WC API Error:", response.status);
        return;
    }

    const data = await response.json();
    for (const o of data) {
        console.log(`ID: ${o.id} | Status: ${o.status} | DateCreated: ${o.date_created} | DateCreatedGMT: ${o.date_created_gmt} | Customer: ${o.billing?.first_name} ${o.billing?.last_name}`);
    }
}
run().finally(() => db.$disconnect());
