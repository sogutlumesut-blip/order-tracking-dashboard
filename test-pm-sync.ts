import { syncPrintMarktOrders } from "./app/actions";

async function run() {
    console.log("Calling syncPrintMarktOrders(true)...");
    const res = await syncPrintMarktOrders(true);
    console.log("Result:", res);
}

run().catch(console.error);
