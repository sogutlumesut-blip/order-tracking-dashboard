
import { db } from "../lib/prisma";

const API_KEY = "OylOoz2vKllZtByiBAbl65NpdsnaNPVlpVTRzgNte8e42427";

async function debugSpecific() {
    console.log("--- 1. Inspecting Local Order 107031 ---");
    const order = await db.order.findFirst({
        where: {
            OR: [
                { barcode: "WC-107031" },
                { customer: { contains: "Mehmet" } } // Fallback
            ]
        }
    });

    if (order) {
        console.log(`Found Local Order: ID=${order.id}, Barcode=${order.barcode}, Customer=${order.customer}`);
        console.log(`Current Label: ${order.cargoLabelPdf}`);
    } else {
        console.log("Local Order 107031 NOT FOUND.");
    }

    console.log("\n--- 2. Inspecting Kargo Shipment 1024718 ---");
    const url = `https://app.kargoentegrator.com/api/shipments/1024718`; // Try direct ID fetch if supported, else search

    try {
        // Since get-by-id might not be documented, I'll search for it too just in case
        const res = await fetch(`https://app.kargoentegrator.com/api/shipments?search=1024718`, {
            headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' }
        });
        const json = await res.json();

        // Also try to find it in the list if search returns multiple
        const ship = json.data ? json.data.find((s: any) => s.id == 1024718) : null;

        if (ship) {
            console.log(`Found Kargo Shipment: ID=${ship.id}`);
            console.log(`Platform ID: ${ship.platform_id} (Expected: 107031)`);
            console.log(`Receiver: ${ship.receiver?.name}`);
            console.log(`Tracking Number: ${ship.tracking_number}`);
            console.log(`Barcode: ${ship.barcode}`);
        } else {
            console.log("Kargo Shipment 1024718 NOT FOUND via search.");
        }

    } catch (e) {
        console.error("Kargo API Error:", e);
    }
}

debugSpecific();
