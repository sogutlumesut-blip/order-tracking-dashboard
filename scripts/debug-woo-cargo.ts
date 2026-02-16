
import { db } from "../lib/prisma";

const WC_CK = "ck_25945894103a890a5f9737839360cc2128795058";
const WC_CS = "cs_d3369d72dc7c22501a4db5a2c417937d57077a79";
const WC_URL = "https://duvarkagidimarketi.com";

async function checkWooMeta() {
    console.log(`Using URL: ${WC_URL}`);
    console.log(`Key: ${WC_CK.substring(0, 5)}...`);

    console.log("Fetching recent orders from WooCommerce (Query Params Method)...");

    // Try Query Params first as it's often more robust against header stripping
    const urlWithAuth = `${WC_URL}/wp-json/wc/v3/orders?per_page=5&consumer_key=${WC_CK}&consumer_secret=${WC_CS}`;

    const response = await fetch(urlWithAuth, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Debugging Script)"
        }
    });

    console.log(`Response Status: ${response.status}`);

    let orders: any[] = [];

    if (response.ok) {
        orders = await response.json();
        console.log(`Fetched ${orders.length} orders.`);
        orders.forEach((o: any) => {
            console.log(`ID: ${o.id}, Number: ${o.number}, Status: ${o.status}, Customer: ${o.billing.first_name} ${o.billing.last_name}`);
        });
    } else {
        console.log("Error:", await response.text());
        return;
    }

    console.log(`Fetched ${orders.length} orders. Inspecting metadata...`);

    for (const order of orders) {
        console.log(`\n--- Order #${order.id} (${order.status}) ---`);
        if (order.meta_data && order.meta_data.length > 0) {
            // Filter for anything that looks like cargo or tracking
            const cargoMeta = order.meta_data.filter((m: any) =>
                m.key.includes('kargo') ||
                m.key.includes('cargo') ||
                m.key.includes('tracking') ||
                m.key.includes('shipment') ||
                m.key.includes('barcode') ||
                m.key.includes('url') ||
                m.key.includes('link') ||
                m.key.includes('entegrator')
            );

            if (cargoMeta.length > 0) {
                console.log("Potential Cargo Meta:");
                cargoMeta.forEach((m: any) => console.log(`  - ${m.key}: ${m.value}`));
            } else {
                console.log("No obvious cargo meta found. Dumping first 5 keys:");
                order.meta_data.slice(0, 5).forEach((m: any) => console.log(`  - ${m.key}`));
            }
        } else {
            console.log("No metadata found.");
        }
    }
}

checkWooMeta();
