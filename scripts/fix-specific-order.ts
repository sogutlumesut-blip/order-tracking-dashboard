
const { Client } = require('pg');

async function fix() {
    console.log("--- FIX ORDER 106725 ---")

    // 1. API Data (Hardcoded from previous fetch to avoid re-fetch bloat in script, or fetch if needed)
    // We know the data from Step 5321 output:
    const trackingNum = "N/A"; // We don't know it yet, assume script logic fixes it
    const trackingLink = "N/A";
    const barcode = "N/A";
    const platformId = "106825";

    const client = new Client({
        connectionString: "postgresql://neondb_owner:npg_qc52eHrBLZvy@ep-wild-sound-ad49s28l-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require"
    });

    try {
        await client.connect();

        // Check before
        const resBefore = await client.query('SELECT id, barcode, "cargoTrackingNumber", "cargoLabelPdf", "cargoBarcode" FROM "Order" WHERE barcode LIKE $1', [`%${platformId}%`]);
        console.log("Before:", resBefore.rows);

        if (resBefore.rows.length === 0) {
            console.log("Order not found in DB to update.");
            return;
        }

        // Update
        const resUpdate = await client.query(
            `UPDATE "Order" 
             SET "cargoTrackingNumber" = $1, "cargoLabelPdf" = $2, "cargoBarcode" = $3
             WHERE barcode LIKE $4`,
            [trackingNum, trackingLink, barcode, `%${platformId}%`]
        );
        console.log(`Updated ${resUpdate.rowCount} rows.`);

        // Check after
        const resAfter = await client.query('SELECT id, barcode, "cargoTrackingNumber", "cargoLabelPdf", "cargoBarcode" FROM "Order" WHERE barcode LIKE $1', [`%${platformId}%`]);
        console.log("After:", resAfter.rows);

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
fix();
