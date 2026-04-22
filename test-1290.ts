import { createDHLShipmentAction } from "./app/actions";
async function run() {
    try {
        console.log("Testing DHL generation for order 1290...");
        const res = await createDHLShipmentAction(1290, true);
        console.log("Result:", res);
    } catch (e) {
        console.error("Caught error:", e);
    }
}
run();
