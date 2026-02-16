
import { getOrders } from "../app/actions";

async function debugGetOrders() {
    console.log("Fetching orders via Server Action...");
    const orders = await getOrders();

    // Find Mehmet Bektaş
    const order = orders.find((o: any) => o.id === 15 || o.barcode === 'WC-107031' || o.customer.includes('Mehmet'));

    if (order) {
        console.log(`Found Order #${order.id} (${order.customer})`);
        console.log(`Status: ${order.status}`);
        console.log(`Cargo Label PDF: ${JSON.stringify(order.cargoLabelPdf)}`);
        console.log(`Order Keys: ${Object.keys(order).join(', ')}`);
    } else {
        console.log("Order not found in getOrders() result.");
    }
}

debugGetOrders();
