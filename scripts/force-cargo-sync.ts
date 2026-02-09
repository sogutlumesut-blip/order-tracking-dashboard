
const { Client } = require('pg');

async function forceCargoSync() {
    console.log("--- FORCE KARGO SYNC (SEARCH 106725) ---")
    const client = new Client({
        connectionString: "postgresql://neondb_owner:npg_qc52eHrBLZvy@ep-wild-sound-ad49s28l-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require"
    });

    await client.connect();

    try {
        // 1. Get API Key
        const resSettings = await client.query('SELECT value FROM "SystemSetting" WHERE key = \'kargo_api_key\'');
        const apiKey = resSettings.rows[0]?.value || "OylOoz2vKllZtByiBAbl65NpdsnaNPVlpVTRzgNte8e42427";

        console.log("Fetching Kargo API...");
        // Use search to find specific order that was missing in list
        const res = await fetch("https://app.kargoentegrator.com/api/shipments?search=106725", {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json'
            }
        });

        if (!res.ok) {
            console.error("Cargo API Error:", res.status);
            return;
        }

        const json = await res.json();
        const shipments = json.data || [];
        console.log(`Fetched ${shipments.length} shipments.`);

        let updatedCount = 0;

        for (const ship of shipments) {
            if (!ship.platform_id) continue;

            const platformId = String(ship.platform_id);
            console.log(`Checking Kargo ID: ${platformId} (Tracking: ${ship.tracking_number})`);

            const trackingNum = ship.tracking_number;
            const trackingLink = ship.tracking_link;
            const cargoBarcode = ship.barcode;

            if (!trackingNum && !trackingLink && !cargoBarcode) continue;

            const updateData = [trackingNum, cargoBarcode, trackingLink || null];

            // Try WC- prefix
            const res1 = await client.query(
                `UPDATE "Order" SET "cargoTrackingNumber" = $1, "cargoBarcode" = $2, "cargoLabelPdf" = $3 WHERE barcode = $4 RETURNING id`,
                [...updateData, `WC-${platformId}`]
            );

            if (res1.rowCount > 0) {
                console.log(`Updated WC-${platformId}`);
                updatedCount++;
            } else {
                // Try pure ID
                const res2 = await client.query(
                    `UPDATE "Order" SET "cargoTrackingNumber" = $1, "cargoBarcode" = $2, "cargoLabelPdf" = $3 WHERE barcode = $4 RETURNING id`,
                    [...updateData, platformId]
                );
                if (res2.rowCount > 0) {
                    console.log(`Updated ${platformId}`);
                    updatedCount++;
                }
            }
        }
        console.log(`Total Updated: ${updatedCount}`);

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
forceCargoSync();
