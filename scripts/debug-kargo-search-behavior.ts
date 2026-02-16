
const API_KEY = "OylOoz2vKllZtByiBAbl65NpdsnaNPVlpVTRzgNte8e42427";

async function debugSearch() {
    console.log("--- 1. Searching for 'Mehmet' ---");
    await search("Mehmet");

    console.log("\n--- 2. Searching for '107031' ---");
    await search("107031");

    console.log("\n--- 3. Searching for '' (Empty String) ---");
    await search("");

    console.log("\n--- 4. Searching for 'UNDEFINED' ---");
    await search("undefined");
}

async function search(term: string) {
    try {
        const res = await fetch(`https://app.kargoentegrator.com/api/shipments?search=${encodeURIComponent(term)}`, {
            headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' }
        });
        const json = await res.json();
        console.log(`Term '${term}' -> Found ${json.data?.length || 0} results.`);
        if (json.data && json.data.length > 0) {
            console.log(`   First Result: ID=${json.data[0].id}, PlatformID=${json.data[0].platform_id}, Receiver=${json.data[0].receiver?.name}`);
        }
    } catch (e) {
        console.error("Error", e);
    }
}

debugSearch();
