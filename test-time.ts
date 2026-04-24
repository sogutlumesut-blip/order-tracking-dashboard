import { db } from './lib/prisma'
import { createDHLShipmentAction } from './app/actions'

async function run() {
    const orderId = 1689; // Using order 1689 from the user's screenshot
    console.log(`Testing order ${orderId}...`);
    console.time("Action");
    const res = await createDHLShipmentAction(orderId, true);
    console.timeEnd("Action");
    console.log(res);
}

run().catch(console.error)
