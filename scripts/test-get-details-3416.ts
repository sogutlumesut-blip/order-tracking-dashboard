import { getOrderDetails } from '../app/actions'

async function main() {
    try {
        const orderId = 3416;
        console.log(`Calling getOrderDetails(${orderId})...`);
        const result = await getOrderDetails(orderId);
        console.log("Result:", JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
}
main();
