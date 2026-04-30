import { db } from './lib/prisma'
import { createDHLShipmentAction } from './app/actions'
import fs from "fs";

async function run() {
    const orderId = 1806;
    
    console.log(`Running createDHLShipmentAction for ${orderId}...`)
    try {
        const res = await createDHLShipmentAction(orderId, true)
        console.log("Result:", res)
    } catch (e) {
        console.error("Exception:", e);
    }
}

run().catch(console.error)
