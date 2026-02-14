
const API_KEY = "OylOoz2vKllZtByiBAbl65NpdsnaNPVlpVTRzgNte8e42427";

async function checkKargoLinks() {
    console.log("Fetching shipments...");
    const res = await fetch("https://app.kargoentegrator.com/api/shipments?per_page=1", {
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json'
        }
    });

    const json = await res.json();
    console.log("Root Links:", JSON.stringify(json.links, null, 2));
    console.log("Root Meta:", JSON.stringify(json.meta, null, 2));

    // Check if 'data' items have any other hidden fields by printing keys of first item
    if (json.data && json.data.length > 0) {
        console.log("Item Keys:", Object.keys(json.data[0]));
    }
}

checkKargoLinks();
