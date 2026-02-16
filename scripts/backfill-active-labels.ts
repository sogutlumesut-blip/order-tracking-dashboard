
import { db } from "../lib/prisma";

const API_KEY = "OylOoz2vKllZtByiBAbl65NpdsnaNPVlpVTRzgNte8e42427";

async function backfill() {
    const orders = await db.order.findMany({
        where: {
            status: { in: ['pending', 'processing', 'baski', 'printing'] },
            cargoLabelPdf: null
        },
        orderBy: { id: 'desc' },
        take: 50 // Do batches
    });

    console.log(`Processing ${orders.length} orders...`);

    for (const order of orders) {
        // Construct search term. Try Barcode (e.g. WC-12345) -> 12345
        // Or customer name.
        let searchTerm = order.barcode?.replace("WC-", "") || order.id.toString();

        // If order.barcode is just "WC-", use logic
        if (order.barcode === "WC-") {
            // Try to guess from ID if imported? No, import creates new ID.
            // Try customer name
            searchTerm = order.customer.split(' ')[0];
        }

        console.log(`Checking Order ${order.id} (${order.customer}) -> Search: ${searchTerm}`);

        try {
            const res = await fetch(`https://app.kargoentegrator.com/api/shipments?search=${encodeURIComponent(searchTerm)}`, {
                headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' }
            });

            if (res.ok) {
                const json = await res.json();
                // Kargo Search behaves unexpectedly, returning unmatched items.
                // We MUST filter by platform_id manually.

                // Expected Platform ID (from order.barcode WC-12345 -> 12345)
                const expectedPlatformId = order.barcode?.replace("WC-", "") || order.id.toString();

                // Find exact match in returned data
                const ship = json.data ? json.data.find((s: any) => s.platform_id == expectedPlatformId) : null;

                if (ship) {
                    console.log(`   > FOUND & VERIFIED Shipment ID: ${ship.id} (Matches PlatformID ${expectedPlatformId})`);
                    const printUrl = `https://app.kargoentegrator.com/print-pdf?shipments[0]=${ship.id}`;

                    await db.order.update({
                        where: { id: order.id },
                        data: {
                            cargoLabelPdf: printUrl,
                            cargoTrackingNumber: ship.tracking_number,
                            hasNotification: true
                        }
                    });
                    console.log("   > Updated DB.");
                } else {
                    console.log(`   > Result found but ID mismatch. (Expected ${expectedPlatformId})`);
                    if (json.data && json.data.length > 0) {
                        console.log(`     > Got: ${json.data[0].platform_id}`);
                    }
                }
            } else {
                console.log(`   > API Error: ${res.status}`);
            }
        } catch (e) {
            console.error("   > Exception:", e);
        }

        // Rate limit kindness
        await new Promise(r => setTimeout(r, 200));
    }
}

backfill();
