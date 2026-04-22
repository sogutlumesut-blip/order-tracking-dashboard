import { createDHLShipmentAction } from "./app/actions";

async function run() {
    console.log("Testing 1339...");
    try {
        const res = await createDHLShipmentAction(1339, true);
        console.log("Response:", res);
    } catch(err) {
        console.error("Error:", err);
    }
}
run();
