import { db } from './lib/prisma'
import { createDHLShipmentAction } from './app/actions'

async function run() {
    const orderId = 1664; // Testing the user's failing order
    console.log(`Running createDHLShipmentAction for ${orderId}...`)
    try {
        const res = await createDHLShipmentAction(orderId, true)
        console.log("Result:", res)
    } catch (e) {
        console.error("Exception:", e);
    }
}

run().catch(console.error)
