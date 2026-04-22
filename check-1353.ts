import { createDHLShipmentAction } from './app/actions'

async function run() {
    console.log("Running createDHLShipmentAction for 1353...");
    const res = await createDHLShipmentAction(1353, true); // true forces MNG sync
    console.log("Result:", res);
}

run().catch(console.error);
