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

    console.log("Fetching last 20 orders from WooCommerce...");
    const response = await fetch(`${cleanUrl}/wp-json/wc/v3/orders?per_page=20&orderby=date&order=desc`, {
        headers: { "Authorization": `Basic ${authString}` },
        cache: 'no-store'
    });

    if (!response.ok) {
        console.log("WC API Error:", response.status, response.statusText);
        return;
    }

    const data = await response.json();
    console.log(`Fetched ${data.length} recent orders from WooCommerce.`);
    
    for (const o of data) {
        const orderInDb = await db.order.findFirst({
            where: {
                OR: [
                    { externalId: String(o.id) },
                    { barcode: `WC-${o.id}` },
                    { barcode: String(o.id) }
                ]
            }
        });
        
        if (orderInDb) {
            console.log(`ORDER ID ${o.id}: IN DB | Customer: ${o.billing?.first_name} ${o.billing?.last_name} | DB Status: ${orderInDb.status} | WC Status: ${o.status} | Date: ${o.date_created}`);
        } else {
            console.log(`ORDER ID ${o.id}: MISSING | Customer: ${o.billing?.first_name} ${o.billing?.last_name} | WC Status: ${o.status} | Date: ${o.date_created}`);
        }
    }
}
run().finally(() => db.$disconnect());
