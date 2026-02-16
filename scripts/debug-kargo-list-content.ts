
const API_KEY = "OylOoz2vKllZtByiBAbl65NpdsnaNPVlpVTRzgNte8e42427";

async function debugList() {
    console.log("Fetching Page 1 of Kargo Shipments...");
    try {
        const res = await fetch(`https://app.kargoentegrator.com/api/shipments?page=1`, {
            headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' }
        });

        const json = await res.json();
        const shipments = json.data || [];

        console.log(`First 5 Shipments on Page 1:`);
        shipments.slice(0, 5).forEach((s: any) => {
            console.log(` - ID: ${s.id}, PlatformID: ${s.platform_id}, Barcode: ${s.barcode}, Receiver: ${s.receiver?.name}`);
        });

    } catch (e) {
        console.error("Error", e);
    }
}

debugList();
