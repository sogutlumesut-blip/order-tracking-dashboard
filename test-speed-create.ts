const API_KEY = "OylOoz2vKllZtByiBAbl65NpdsnaNPVlpVTRzgNte8e42427";
const BASE_URL = "https://app.kargoentegrator.com/api";

async function run() {
    const payload = {
        cargo_integration_id: 1220,
        warehouse_id: 41,
        customer: {
            name: "Test",
            surname: "User",
            phone: "05550000000",
            email: "test@test.com",
            country: "TR",
            city: "Bursa",
            district: "Nilüfer",
            address: "Test adresi"
        },
        payment_type: "credit_card",
        package_type: "box",
        payor_type: "sender",
        is_pay_at_door: false,
        total: 100,
        currency: "TRY",
        desi: 1,
        platform_id: "TEST-123-DESC",
        platform_d_id: "TEST-123-DESC",
        description: "AÇIKLAMA TESTİ: 1x Duvar Kağıdı (300x200), 2x Yapıştırıcı",
        note: "AÇIKLAMA TESTİ: 1x Duvar Kağıdı (300x200), 2x Yapıştırıcı",
        lines: [{ title: "Item 1", quantity: 1, sku: "TEST", platform_id: "1" }]
    };

    const res = await fetch(`${BASE_URL}/shipments`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${API_KEY}`,
            "Accept": "application/json",
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.log("Shipment created:", data.data.id);
}
run();
