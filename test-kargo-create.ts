import { db } from "./lib/prisma";
import fs from "fs";

async function run() {
    const orderId = 1661;
    const order = await db.order.findUnique({
        where: { id: orderId },
        include: { items: true }
    });

    if (!order) return;

    const apiKey = "OylOoz2vKllZtByiBAbl65NpdsnaNPVlpVTRzgNte8e42427";
    const headers = {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
        "Content-Type": "application/json"
    };

    let il = "Bilinmiyor";
    let ilce = "Bilinmiyor";
    if (order.city && order.city.includes('/')) {
        const parts = order.city.split('/');
        il = parts[parts.length - 1].trim();
        ilce = parts[0].trim();
    }

    const nameParts = (order.customer || "").trim().split(' ');
    const surname = nameParts.length > 1 ? nameParts.pop() : "Müşteri";
    const name = nameParts.join(' ') || "Müşteri";

    const payload = {
        cargo_integration_id: 1220,
        warehouse_id: 41,
        customer: {
            name: name,
            surname: surname,
            phone: (order.phone || "05550000000").replace(/[^0-9+]/g, ''),
            email: order.email || "info@duvarkagidimarketi.com",
            country: "TR",
            postcode: "",
            city: il,
            district: ilce,
            address: order.address || "Adres Bilinmiyor"
        },
        payment_type: "credit_card",
        package_type: "box",
        payor_type: "sender",
        is_pay_at_door: false,
        total: parseFloat(String(order.total).replace(/[^0-9.]/g, '')) || 0,
        currency: "TRY",
        desi: 1,
        platform_id: order.id + 1000, // Try different ID
        platform_d_id: order.id + 1000,
        note: order.note || "",
        lines: order.items.map(item => ({
            title: item.name,
            quantity: item.quantity,
            platform_id: item.id,
            image: "",
            sku: item.sku || "SKU"
        }))
    };

    try {
        const res = await fetch("https://app.kargoentegrator.com/api/shipments", {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
        });

        console.log("Status:", res.status);
        const text = await res.text();
        fs.writeFileSync("kargo-res.json", text);
        console.log("Response written to kargo-res.json");
    } catch (e) {
        console.error(e);
    }
}

run().catch(console.error);
