
import { db } from "../lib/prisma";

async function findOrder() {
    console.log("Searching for order...");
    // Search by partial label match or item name
    const orders = await db.order.findMany({
        where: {
            OR: [
                { labels: { contains: "FEDEX" } },
                { items: { some: { name: { contains: "Özel Sipariş Ürün - 4" } } } }
            ]
        },
        include: { items: true },
        take: 5,
        orderBy: { id: 'desc' }
    });

    console.log(`Found ${orders.length} orders.`);
    orders.forEach(o => {
        console.log(`ID: ${o.id}, Barcode: ${o.barcode}, Customer: ${o.customer}`);
        console.log(`   Labels: ${o.labels}`);
        console.log(`   Items: ${o.items.map(i => i.name).join(', ')}`);
        console.log(`   Cargo: ${o.cargoTrackingNumber} / ${o.cargoLabelPdf}`);
        console.log('---');
    });
}

findOrder();
