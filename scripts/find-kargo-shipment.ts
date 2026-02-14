
const API_KEY = "OylOoz2vKllZtByiBAbl65NpdsnaNPVlpVTRzgNte8e42427";

// Target ID: 107019
// We will search for '107019' in platform_id or barcode field across multiple pages.

async function findShipment() {
    console.log("Searching API for 107019...");

    for (let page = 1; page <= 5; page++) {
        const res = await fetch(`https://app.kargoentegrator.com/api/shipments?per_page=100&page=${page}`, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Accept': 'application/json'
            }
        });

        const json = await res.json();
        const data = json.data || [];
        console.log(`Page ${page}: ${data.length} items`);

        const found = data.find((s: any) =>
            String(s.platform_id) === '107019' ||
            String(s.barcode).includes('107019')
        );

        if (found) {
            console.log("FOUND SHIPMENT:", JSON.stringify(found, null, 2));
            return;
        }
    }
    console.log("Not found in first 5 pages (500 items).");
}

findShipment();
