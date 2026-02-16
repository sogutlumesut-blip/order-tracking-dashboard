
import { db } from "../lib/prisma";

async function inspectWooOrder() {
    console.log("Fetching Woo Credentials...");
    const settings = await db.systemSetting.findMany({
        where: { key: { in: ['wc_url', 'wc_key', 'wc_secret'] } }
    });

    const wcUrl = settings.find(s => s.key === 'wc_url')?.value;
    const wcKey = settings.find(s => s.key === 'wc_key')?.value;
    const wcSecret = settings.find(s => s.key === 'wc_secret')?.value;

    const orderId = 107013;
    const url = `${wcUrl}/wp-json/wc/v3/orders/${orderId}?consumer_key=${wcKey}&consumer_secret=${wcSecret}`;

    console.log(`Fetching Order ${orderId}...`);
    const res = await fetch(url);
    console.log(`Response Status: ${res.status}`);

    const text = await res.text();
    console.log("Raw Response:", text.substring(0, 500)); // First 500 chars

    let order;
    try {
        order = JSON.parse(text);
    } catch (e) {
        console.error("Failed to parse JSON");
        return;
    }

    if (!order.meta_data) {
        console.error("No meta_data found in response!");
        return;
    }

    console.log(`Order ID: ${order.id}`);
    console.log(`Status: ${order.status}`);

    console.log("MetaData:");
    order.meta_data.forEach((m: any) => {
        console.log(` - ${m.key}: ${JSON.stringify(m.value)}`);
    });

    console.log("All Meta Keys:", order.meta_data.map((m: any) => m.key).join(', '));

    // Fetch Notes
    console.log("\nFetching Order Notes...");
    const notesUrl = `${wcUrl}/wp-json/wc/v3/orders/${orderId}/notes?consumer_key=${wcKey}&consumer_secret=${wcSecret}`;

    try {
        const notesRes = await fetch(notesUrl);
        const notes = await notesRes.json();
        console.log(`Found ${notes.length} notes.`);
        notes.forEach((n: any) => {
            console.log(` - [${n.date_created}] ${n.note}`);
        });
    } catch (e) {
        console.error("Failed to fetch notes", e);
    }
}

inspectWooOrder();
