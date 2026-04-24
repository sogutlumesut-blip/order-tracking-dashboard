import { createDHLShipmentAction } from "./app/actions";

async function run() {
    console.log("Testing DHL API for Order #1661...");
    const result = await createDHLShipmentAction(1661, true); // bypassAuth = true
    console.log("Result:", result);
}

run().catch(console.error);
