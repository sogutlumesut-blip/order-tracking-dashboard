import { PrismaClient } from '@prisma/client'
// Using standard fetch to avoid installing woocommerce-rest-api
const db = new PrismaClient()

async function run() {
    console.log("Checking WooCommerce (duvarkagidimarketi.com)...");
    const settings = await db.systemSetting.findMany();
    const wcUrl = settings.find(s => s.key === 'wc_url')?.value;
    const wcKey = settings.find(s => s.key === 'wc_key')?.value;
    const wcSecret = settings.find(s => s.key === 'wc_secret')?.value;

    if (!wcUrl || !wcKey || !wcSecret) return console.log("Missing WC credentials");

    const cleanUrl = wcUrl.replace(/\/+$/, '');
    const authString = Buffer.from(`${wcKey}:${wcSecret}`).toString('base64');

    console.log(`Fetching from: ${cleanUrl}/wp-json/wc/v3/orders?per_page=5&orderby=date&order=desc`);
    try {
        const response = await fetch(`${cleanUrl}/wp-json/wc/v3/orders?per_page=5&orderby=date&order=desc`, {
            headers: { "Authorization": `Basic ${authString}` },
            cache: 'no-store'
        });

        if (!response.ok) {
            console.log("WC API Error:", response.status, response.statusText);
            return;
        }

        const data = await response.json();
        console.log(`Fetched ${data.length} recent orders from WC.`);
        data.forEach((o: any) => {
            console.log(`ID: ${o.id} | Status: ${o.status} | Total: ${o.total} | Name: ${o.billing?.first_name} ${o.billing?.last_name} | Date: ${o.date_created}`);
        });
    } catch (e: any) {
        console.log("WC Fetch Error:", e.message);
    }
}
run().finally(() => db.$disconnect());
