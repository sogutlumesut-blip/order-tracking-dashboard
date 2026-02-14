
const API_KEY = "OylOoz2vKllZtByiBAbl65NpdsnaNPVlpVTRzgNte8e42427";

// Try to use search parameters if they exist
// Common patterns: ?search=..., ?q=..., ?query=..., ?tracking_number=..., ?barcode=...

async function searchShipment() {
    console.log("Attempting direct search for 107019...");

    const endpoints = [
        `https://app.kargoentegrator.com/api/shipments?search=107019`,
        `https://app.kargoentegrator.com/api/shipments?q=107019`,
        `https://app.kargoentegrator.com/api/shipments?barcode=107019`,
        `https://app.kargoentegrator.com/api/shipments?platform_id=107019`
    ];

    for (const url of endpoints) {
        console.log(`Trying: ${url}`);
        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Accept': 'application/json'
            }
        });
        const json = await res.json();
        if (json.data && json.data.length > 0) {
            console.log("FOUND via search!", JSON.stringify(json.data[0], null, 2));
            return;
        }
    }
    console.log("Direct search failed.");
}

searchShipment();
