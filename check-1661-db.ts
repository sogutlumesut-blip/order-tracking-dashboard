import { db } from "./lib/prisma";

async function run() {
    const order = await db.order.findUnique({
        where: { id: 1661 },
        select: { id: true, address: true, city: true }
    });
    console.log("Order 1661 Address:", order);
}

run().catch(console.error);
