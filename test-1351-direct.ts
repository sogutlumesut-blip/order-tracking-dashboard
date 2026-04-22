import { db } from './lib/prisma'
import { createDHLShipmentAction } from './app/actions'

async function run() {
    // temporarily set externalId of 1351 to string "1351-T"
    await db.order.update({
        where: { id: 1351 },
        data: { externalId: "1351-X" } // Use a clear clean ID
    });
    
    console.log("Running createDHLShipmentAction for 1351 with externalId 1351-X...")
    const res = await createDHLShipmentAction(1351, true)
    console.log("Result:", res)
}

run().catch(console.error)
