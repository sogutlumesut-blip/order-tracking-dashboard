import { db } from './lib/prisma'

const API_KEY = "OylOoz2vKllZtByiBAbl65NpdsnaNPVlpVTRzgNte8e42427";
const BASE_URL = "https://app.kargoentegrator.com/api";

async function run() {
    const orderId = 1663;
    const order = await db.order.findUnique({
        where: { id: orderId },
        include: { items: true }
    });

    if (!order) return;

    const headers = {
        "Authorization": `Bearer ${API_KEY}`,
        "Accept": "application/json",
        "Content-Type": "application/json"
    };

    const payload = {
        cargo_integration_id: 1220,
        warehouse_id: 41,
        customer: {
            name: "Test",
            surname: "Test",
            phone: "05550000000",
            email: "info@duvarkagidimarketi.com",
            country: "TR",
            postcode: "",
            city: "Antalya",
            district: "Muratpaşa",
            address: "Adres Bilinmiyor"
        },
        payment_type: "credit_card",
        package_type: "box",
        payor_type: "sender",
        is_pay_at_door: false,
        total: 100,
        currency: "TRY",
        desi: 1,
        platform_id: Date.now() + "",
        platform_d_id: Date.now() + "",
        note: "",
        lines: []
    };

    console.log("Step 1: POST /api/shipments");
    const s1 = Date.now();
    const res = await fetch(`${BASE_URL}/shipments`, {
        method: "POST", headers, body: JSON.stringify(payload)
    });
    const s2 = Date.now();
    console.log(`Step 1 took: ${(s2 - s1)/1000}s`);

    const data = await res.json();
    const shipmentId = data?.data?.id;

    console.log("Step 2: GET /api/print-pdf");
    const s3 = Date.now();
    const pdfRes = await fetch(`${BASE_URL}/print-pdf?shipments[0]=${shipmentId}`, {
        headers
    });
    const s4 = Date.now();
    console.log(`Step 2 took: ${(s4 - s3)/1000}s`);
}

run().catch(console.error)
