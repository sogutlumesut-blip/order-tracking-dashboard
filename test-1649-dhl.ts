import { createDHLShipmentAction } from "./app/actions";

async function run() {
    console.log("Testing DHL API for Order #1649...");
    const res = await createDHLShipmentAction(1649, true);
    console.log("Result:", res);
}

run().catch(console.error);
