import { db } from './lib/prisma'
import { createDHLShipmentAction } from './app/actions'

async function run() {
    console.log("Creating DHL for 1755...");
    const res = await createDHLShipmentAction(1755, true);
    console.log("Result:", res);
}
run().catch(console.error)
