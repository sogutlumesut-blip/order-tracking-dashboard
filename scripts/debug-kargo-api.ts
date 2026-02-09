
const { Client } = require('pg');

async function debug() {
    console.log("--- DEBUG START (Kargo Entegrator API Deep Dive) ---")

    const API_KEY = "OylOoz2vKllZtByiBAbl65NpdsnaNPVlpVTRzgNte8e42427";
    const BASE_URL = "https://app.kargoentegrator.com/api/shipments";

    try {
        // 1. Fetch Latest 50 items to find a shipped one
        console.log(`\nFetching ${BASE_URL}...`);
        const response = await fetch(`${BASE_URL}?per_page=50`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            console.error(`Error: ${response.status} ${response.statusText}`);
            return;
        }

        const json = await response.json();
        const data = json.data || [];
        console.log(`Fetched ${data.length} shipments.`);

        // 2. Find one with tracking info
        const shipped = data.find(item => item.tracking_number || item.tracking_link || item.barcode_link || item.label_link || (item.status !== 'non_processed' && item.status !== 'pending'));

        if (shipped) {
            console.log("\n>>> FOUND SHIPPED ITEM:", shipped.id);
            console.log(JSON.stringify(shipped, null, 2));

            // Probe for Label/Print endpoints
            const labelCandidates = [
                `${BASE_URL}/${shipped.id}/label`,
                `${BASE_URL}/${shipped.id}/print`,
                `${BASE_URL}/${shipped.id}/pdf`,
                `https://app.kargoentegrator.com/api/print/shipments?ids=${shipped.id}`,
                `https://app.kargoentegrator.com/api/shipment/print/${shipped.id}`,
                `https://app.kargoentegrator.com/api/shipments/print?ids[]=${shipped.id}`
            ];

            console.log("\nProbing Label Endpoints...");
            for (const url of labelCandidates) {
                try {
                    console.log(`GET ${url}`);
                    const res = await fetch(url, {
                        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' }
                    });
                    if (res.ok) {
                        const contentType = res.headers.get('content-type');
                        console.log(`[SUCCESS] ${url} -> Status: ${res.status}, Type: ${contentType}`);
                        if (contentType.includes('json')) {
                            const j = await res.json();
                            console.log("Body:", JSON.stringify(j).substring(0, 200));
                        }
                    } else {
                        console.log(`[FAILED] ${url} -> ${res.status}`);
                    }
                } catch (e) { console.log(`[ERROR] ${url}: ${e.message}`); }
            }
        } else {
            console.log("\nNo items with tracking info found in the last 50.");
        }

        // 3. Test Filtering by Order ID (using one from the list or a known one)
        const testId = "106742"; // Known order in DB
        console.log(`\nTesting Filter by platform_id=${testId}...`);

        // Try 'search' param
        const resSearch = await fetch(`${BASE_URL}?search=${testId}`, {
            headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' }
        });
        const jsonSearch = await resSearch.json();
        console.log(`Filter 'search=${testId}' found: ${jsonSearch.data?.length} items.`);
        if (jsonSearch.data?.length > 0) {
            console.log("Item:", JSON.stringify(jsonSearch.data[0], null, 2));
        }

    } catch (e) {
        console.log(`Error: ${e.message}`);
    }

    console.log("--- DEBUG END ---")
}

debug();
