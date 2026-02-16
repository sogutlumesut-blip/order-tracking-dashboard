
import { db } from "../lib/prisma";

async function diagnose() {
    const pendingOrders = await db.order.findMany({
        where: {
            status: { in: ['pending', 'processing', 'baski', 'printing'] }, // Active statuses
            cargoLabelPdf: null
        },
        orderBy: { id: 'desc' }
    });

    console.log(`Found ${pendingOrders.length} active orders WITHOUT Cargo Labels.`);

    if (pendingOrders.length > 0) {
        console.log("--- First 5 Missing ---");
        pendingOrders.slice(0, 5).forEach(o => {
            console.log(`ID: ${o.id}, Customer: ${o.customer}, Date: ${o.createdAt}`);
        });
    }

    // Check if the "Old Orders" user mentioned (e.g. older than 7 days) are appearing
    const oldOrders = await db.order.findMany({
        where: { createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        orderBy: { id: 'desc' },
        take: 5
    });
    console.log(`\n--- Sample Old Orders in DB ---`);
    oldOrders.forEach(o => {
        console.log(`ID: ${o.id}, Status: ${o.status}, Date: ${o.createdAt}`);
    });
}

diagnose();
