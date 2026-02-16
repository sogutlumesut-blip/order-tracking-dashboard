
import { db } from "../lib/prisma";

const API_KEY = "OylOoz2vKllZtByiBAbl65NpdsnaNPVlpVTRzgNte8e42427";

async function debugSync() {
    console.log("Starting Debug Sync (Pagination Check)...");

    const MAX_PAGES = 7;
    let totalItems = 0;
    let matchedCount = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
        console.log(`Fetching Page ${page}...`);
        const res = await fetch(`https://app.kargoentegrator.com/api/shipments?per_page=100&page=${page}`, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Accept': 'application/json'
            }
        });

        const json = await res.json();
        const shipments = json.data || [];
        totalItems += shipments.length;

        if (shipments.length === 0) {
            console.log("No more shipments.");
            break;
        }

        console.log(`Page ${page}: Got ${shipments.length} items.`);

        for (const ship of shipments) {
            if (!ship.platform_id) continue;
            const platformId = String(ship.platform_id);
            const trackingNum = ship.tracking_number;

            if (shipments.indexOf(ship) < 5) {
                console.log(`Debug Ship: ID=${ship.id}, PlatformID=${platformId}, Barcode=${ship.barcode}, Tracking=${trackingNum}`);
            }

            // Check if this exists in our DB
            const order = await db.order.findUnique({
                where: { barcode: `WC-${platformId}` }
            });

            if (order) {
                console.log(`MATCH! Order ${order.id} (WC-${platformId}) found in Kargo Page ${page}.`);
                console.log(`   > Kargo Tracking: ${trackingNum}`);
                console.log(`   > Local Tracking: ${order.cargoTrackingNumber}`);
                if (order.cargoTrackingNumber !== trackingNum) {
                    console.log("   *** UPDATE NEEDED ***");
                }
                matchedCount++;
            }
        }
    }

    console.log(`\nSummary:`);
    console.log(`Total Scanned: ${totalItems}`);
    console.log(`Total Matches in DB: ${matchedCount}`);
}

debugSync();
