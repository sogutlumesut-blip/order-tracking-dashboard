
const { Client } = require('pg');

async function debug() {
    console.log("--- DEBUG START (Inspect WC Metadata) ---")

    // Credentials from .env.local
    const client = new Client({
        connectionString: "postgresql://neondb_owner:npg_qc52eHrBLZvy@ep-wild-sound-ad49s28l-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require"
    });

    try {
        await client.connect();
        console.log("Connected to Postgres.");
    } catch (e) {
        console.error("Connection Failed:", e.message);
        return;
    }

    // 1. Get WC Credentials
    let wcUrl, wcKey, wcSecret;
    try {
        const res = await client.query(`
            SELECT key, value FROM "SystemSetting" 
            WHERE key IN ('wc_url', 'wc_key', 'wc_secret')
        `);

        const settings = {};
        res.rows.forEach(r => settings[r.key] = r.value);

        wcUrl = settings['wc_url'];
        wcKey = settings['wc_key'];
        wcSecret = settings['wc_secret'];

        if (!wcUrl || !wcKey || !wcSecret) {
            console.error("Missing WC Credentials in DB");
            await client.end();
            return;
        }
        console.log(`Found Credentials for: ${wcUrl}`);
    } catch (e) {
        console.error("Settings Query Error:", e.message);
        await client.end();
        return;
    }

    await client.end();

    // 2. Fetch Orders from WC
    console.log("Fetching orders from WooCommerce...");
    const auth = Buffer.from(`${wcKey}:${wcSecret}`).toString('base64');

    try {
        const response = await fetch(`${wcUrl}/wp-json/wc/v3/orders?per_page=10&status=completed`, {
            headers: {
                'Authorization': `Basic ${auth}`
            }
        });

        if (!response.ok) {
            console.error("WC API Error:", response.status, response.statusText);
            const text = await response.text();
            console.error(text);
            return;
        }

        const orders = await response.json();
        console.log(`Fetched ${orders.length} orders.`);

        // 3. Deep Inspect
        orders.forEach(order => {
            console.log(`\nOrder #${order.id} (Status: ${order.status})`);

            // Check Shipping Lines
            if (order.shipping_lines) {
                console.log("Shipping Lines:", JSON.stringify(order.shipping_lines, null, 2));
            }

            // Stringify and regex search for potential barcodes
            const str = JSON.stringify(order);
            // Look for patterns like "MNG", "cargo", or long digits that might be tracking
            // Just log if found
            if (str.toLowerCase().includes("mng") || str.toLowerCase().includes("kargo")) {
                console.log(">>> Found 'mng' or 'kargo' in order object.");
            }

            if (order.meta_data) {
                const url = order.meta_data.find(m => m.key === '_url');
                const kargo = order.meta_data.find(m => m.key === '_kargo_firmasi');
                const stok = order.meta_data.find(m => m.key === '_stok_kodu');

                if (url) console.log(`  _url: ${url.value}`);
                if (kargo) console.log(`  _kargo_firmasi: ${kargo.value}`);
                if (stok) console.log(`  _stok_kodu: ${stok.value}`);
            }
            // Log all meta keys again just to be sure
            if (order.meta_data) {
                console.log("Meta Keys:", order.meta_data.map(m => m.key));
                // value check
                order.meta_data.forEach(m => {
                    if (typeof m.value === 'string' && m.value.length > 10 && m.value.length < 30) {
                        console.log(`  Possible ID [${m.key}]: ${m.value}`);
                    }
                });
            }
        });

    } catch (e) {
        console.error("Fetch Error:", e.message);
    }

    console.log("--- DEBUG END ---")
}

debug();
