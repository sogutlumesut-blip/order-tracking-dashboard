import { getOrders } from './app/actions';

async function main() {
    console.log("Fetching orders...");
    const start = Date.now();
    try {
        const orders = await getOrders();
        console.log(`Fetched ${orders.length} orders in ${Date.now() - start}ms`);
    } catch (e) {
        console.error("FAIL:", e);
    }
}
main();
