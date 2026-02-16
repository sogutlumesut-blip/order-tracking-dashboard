
const API_KEY = "OylOoz2vKllZtByiBAbl65NpdsnaNPVlpVTRzgNte8e42427";

async function searchByName() {
    console.log("Searching Kargo API for 'Cem'...");

    // Search endpoint often checks name/address/id
    const url = `https://app.kargoentegrator.com/api/shipments?search=Cem`;

    const res = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json'
        }
    });

    const json = await res.json();
    const data = json.data || [];

    console.log(`Found ${data.length} records matching 'Cem'.`);

    data.forEach((s: any) => {
        console.log(`- ID: ${s.id}, PlatformID: ${s.platform_id}, Receiver: ${s.receiver?.name}, Status: ${s.status}`);
    });
}

searchByName();
