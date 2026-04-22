import { createDHLShipmentAction } from "./app/actions";
async function run() {
    try {
        console.log("Testing DHL generation for order 1265...");
        const res = await createDHLShipmentAction(1265, true);
        console.log("Result:", res);
    } catch (e) {
        console.error("Caught error:", e);
    }
}
run();
