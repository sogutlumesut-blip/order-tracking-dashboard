
const { Client } = require('pg');

async function check() {
    console.log("--- CHECK ORDER ---")
    const client = new Client({
        connectionString: "postgresql://neondb_owner:npg_qc52eHrBLZvy@ep-wild-sound-ad49s28l-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require"
    });
    await client.connect();

    try {
        const res = await client.query('SELECT id, barcode, status, "cargoTrackingNumber" FROM "Order" WHERE barcode LIKE \'%106731%\'');
        console.log("Check 106731:", res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
check();
