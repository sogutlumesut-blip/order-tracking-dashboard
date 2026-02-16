
import { db } from "../lib/prisma";

const API_KEY = "OylOoz2vKllZtByiBAbl65NpdsnaNPVlpVTRzgNte8e42427";

async function backfillList() {
    console.log("Fetching pending orders from DB...");
    const pendingOrders = await db.order.findMany({
        where: {
            status: { in: ['pending', 'processing', 'baski', 'printing'] },
            cargoLabelPdf: null
        },
        select: { id: true, barcode: true, customer: true }
    });

    console.log(`Found ${pendingOrders.length} pending orders locally.`);
    // Map platform IDs for quick lookup
    const pendingMap = new Map<string, number>();
    pendingOrders.forEach(o => {
        const pid = o.barcode?.replace("WC-", "") || o.id.toString();
        pendingMap.set(pid, o.id);
    });

    // Scan last 20 pages of Kargo (approx 300 items)
    for (let page = 1; page <= 20; page++) {
        console.log(`Fetching Kargo Page ${page}...`);
        try {
            const res = await fetch(`https://app.kargoentegrator.com/api/shipments?page=${page}`, {
                headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' }
            });

            if (!res.ok) {
                console.log("API Error", res.status);
                break;
            }

            const json = await res.json();
            const shipments = json.data || [];
            console.log(`   > Got ${shipments.length} shipments.`);

            if (shipments.length === 0) break;

            for (const ship of shipments) {
                const pid = ship.platform_id?.toString();
                if (pendingMap.has(pid)) {
                    const localId = pendingMap.get(pid);
                    console.log(`   MATCH FOUND! Local Order ${localId} <-> Kargo ${ship.id}`);

                    const printUrl = `https://app.kargoentegrator.com/print-pdf?shipments[0]=${ship.id}`;

                    await db.order.update({
                        where: { id: localId },
                        data: {
                            cargoLabelPdf: printUrl,
                            cargoTrackingNumber: ship.tracking_number,
                            hasNotification: true
                        }
                    });
                    console.log(`   > Synced.`);
                    pendingMap.delete(pid); // Remove from need-list
                }
            }
        } catch (e) {
            console.error("Exception page " + page, e);
        }
    }

    console.log(`Remaining unmatched orders: ${pendingMap.size}`);
}

backfillList();
