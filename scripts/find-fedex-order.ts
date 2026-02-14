
import { db } from "../lib/prisma";

async function findFedexOrders() {
    console.log("Searching for FEDEX orders...");
    const orders = await db.order.findMany({
        where: {
            labels: { contains: "FEDEX" }
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
        console.log('---');
    });
}

findFedexOrders();
