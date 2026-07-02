import { db } from "./lib/prisma";

async function run() {
    const logs = await db.orderActivity.findMany({
        take: 20,
        orderBy: { timestamp: 'desc' }
    });
    console.log("Recent Order Activities:");
    logs.forEach(l => console.log(`[${l.timestamp.toISOString()}] Order #${l.orderId} by ${l.author}: ${l.action} - ${l.details}`));
}

run().catch(console.error);
