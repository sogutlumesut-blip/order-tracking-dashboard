
import { db } from "../lib/prisma";

async function findVolkanOrder() {
    console.log("Searching for Volkan Demir...");
    const orders = await db.order.findMany({
        where: {
            OR: [
                { customer: { contains: "Volkan Demir" } },
                { phone: { contains: "553 225 62 83" } }
            ]
        },
        include: { items: true }
    });

    console.log(`Found ${orders.length} orders.`);
    orders.forEach(o => {
        console.log(`ID: ${o.id}, Status: ${o.status}, Barcode: ${o.barcode}`);
        console.log(`   Customer: ${o.customer}, Phone: ${o.phone}`);
        console.log(`   Label PDF: ${o.cargoLabelPdf}`);
        console.log(`   Tracking: ${o.cargoTrackingNumber}`);
        console.log(`   Raw Cargo: ${o.cargoBarcode}`);
    });
}

findVolkanOrder();
