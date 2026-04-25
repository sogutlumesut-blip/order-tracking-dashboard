import { db } from './lib/prisma'
async function run() {
    const API_KEY = "OylOoz2vKllZtByiBAbl65NpdsnaNPVlpVTRzgNte8e42427";
    const BASE_URL = "https://app.kargoentegrator.com/api";
    const shipmentId = "1347860"; // The one I just created
    
    console.log("Fetching PDF...");
    const pdfRes = await fetch(`${BASE_URL}/print-pdf?shipments[0]=${shipmentId}`, {
        headers: {
            "Authorization": `Bearer ${API_KEY}`,
            "Accept": "application/json"
        }
    });
    
    console.log("Status:", pdfRes.status);
    console.log("Content-Type:", pdfRes.headers.get("Content-Type"));
    
    const text = await pdfRes.text();
    console.log("Body preview:", text.substring(0, 200));
}
run().catch(console.error)
