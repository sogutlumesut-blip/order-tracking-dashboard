
const { Client } = require('pg');

async function debug() {
    console.log("--- DEBUG START (Postgres) ---")

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

    // 1. Check Order V166
    console.log("Searching for V166...");

    try {
        const res = await client.query(`
            SELECT id, barcode, "cargoBarcode", "cargoLabelPdf" 
            FROM "Order" 
            WHERE barcode = $1 OR barcode LIKE $2
        `, ['V166', '%V166%']);

        if (res.rows.length > 0) {
            const order = res.rows[0];
            console.log(`Order Found: ${order.barcode}`);
            console.log(`Cargo Barcode: ${order.cargoBarcode}`);
            console.log(`Cargo Label PDF Length: ${order.cargoLabelPdf ? order.cargoLabelPdf.length : 0}`);
        } else {
            console.log("Order V166 NOT FOUND in 'Order' table.");
            // Check items
            const itemRes = await client.query(`
                SELECT "orderId", sku FROM "OrderItem" WHERE sku LIKE $1
            `, ['%V166%']);

            if (itemRes.rows.length > 0) {
                console.log(`Found Item with SKU V166 in Order ID: ${itemRes.rows[0].orderId}`);
                const parentRes = await client.query(`SELECT * FROM "Order" WHERE id = $1`, [itemRes.rows[0].orderId]);
                const parent = parentRes.rows[0];
                console.log(`Parent Order Barcode: ${parent.barcode}`);
                console.log(`Parent Order Cargo: ${parent.cargoBarcode}`);
            }
        }
    } catch (e) {
        console.error("Order Query Error:", e.message);
    }

    // 2. Check Etsy Settings
    console.log("\nChecking Etsy Settings...");
    try {
        const res = await client.query(`
            SELECT key, value FROM "SystemSetting" 
            WHERE key IN ('etsy_stores_json', 'etsy_shop_id', 'etsy_api_key')
        `);

        res.rows.forEach(s => console.log(`${s.key}: ${s.value}`));
    } catch (e) {
        console.error("Settings Query Error:", e.message);
    }

    await client.end();
    console.log("--- DEBUG END ---")
}

debug();
