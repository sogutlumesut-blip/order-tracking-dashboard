import { db } from './lib/prisma';

async function run() {
    const orders = await db.order.findMany({
        orderBy: { date: "desc" },
        take: 500,
    });
    
    console.log("Total orders fetched:", orders.length);
    console.log("Status distribution:");
    const dist: Record<string, number> = {};
    for (const o of orders) {
        dist[o.status] = (dist[o.status] || 0) + 1;
    }
    console.log(dist);
    
    console.log("How many are from PrintMarkt?", orders.filter((o: any) => o.source === 'PrintMarkt').length);
}
run();
