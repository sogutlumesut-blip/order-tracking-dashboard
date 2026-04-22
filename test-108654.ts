import { createDHLShipmentAction } from './app/actions'

async function run() {
    console.log("Starting DHL label generation for 1351...")
    const res = await createDHLShipmentAction(1351, true)
    console.log("Result:", res)
}

run().catch(console.error)
