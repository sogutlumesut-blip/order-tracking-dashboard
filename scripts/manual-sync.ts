import { syncWooCommerceOrders } from '../app/actions'

async function main() {
    try {
        console.log("Starting Manual WooCommerce Sync...");
        const result = await syncWooCommerceOrders(true); // Force sync
        console.log("Sync Result:", JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("Sync Error:", e);
    }
}

main();
