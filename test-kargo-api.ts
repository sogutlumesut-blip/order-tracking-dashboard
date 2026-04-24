async function testApi() {
    const apiKey = "OylOoz2vKllZtByiBAbl65NpdsnaNPVlpVTRzgNte8e42427";
    const headers = {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
        "Content-Type": "application/json"
    };

    console.log("Testing Shipments...");
    try {
        const intRes = await fetch("https://app.kargoentegrator.com/api/shipments", { headers });
        console.log("Shipments Status:", intRes.status);
        console.log("Shipments:", await intRes.text());
    } catch (e) {
        console.error(e);
    }
}

testApi();
