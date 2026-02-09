
const { Client } = require('pg');

async function check() {
    console.log("--- CHECK ORDER ---")
    const client = new Client({
        connectionString: "postgresql://neondb_owner:npg_qc52eHrBLZvy@ep-wild-sound-ad49s28l-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require"
    });
    await client.connect();

    try {
        const res = await client.query('SELECT id, barcode, "cargoTrackingNumber", "cargoLabelPdf" FROM "Order" WHERE barcode LIKE \'%106742%\' OR barcode LIKE \'%106686%\'');
        console.log("Found:", res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
check();
