import { db } from "./lib/prisma";

async function run() {
    const order = await db.order.findUnique({ where: { id: 1649 } });
    console.log("Order 1649:", order?.address, order?.city);
}

run().catch(console.error);
