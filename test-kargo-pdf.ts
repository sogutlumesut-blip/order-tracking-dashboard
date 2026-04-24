import fs from "fs";

async function run() {
    const apiKey = "OylOoz2vKllZtByiBAbl65NpdsnaNPVlpVTRzgNte8e42427";
    const headers = {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
        "Content-Type": "application/json"
    };

    try {
        const url = "https://app.kargoentegrator.com/api/print-pdf?shipments[0]=1339173";
        const res = await fetch(url, { headers });
        console.log("URL:", url, "Status:", res.status);
        if (res.status === 200) {
            fs.writeFileSync("test-pdf1.json", await res.text());
        }

        const url2 = "https://app.kargoentegrator.com/api/shipments/1339173/print";
        const res2 = await fetch(url2, { headers });
        console.log("URL:", url2, "Status:", res2.status);
        
        const url3 = "https://app.kargoentegrator.com/api/shipments/print?shipments[0]=1339173";
        const res3 = await fetch(url3, { headers });
        console.log("URL:", url3, "Status:", res3.status);
    } catch (e) {
        console.error(e);
    }
}

run().catch(console.error);
