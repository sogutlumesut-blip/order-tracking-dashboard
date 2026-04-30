const API_KEY = "OylOoz2vKllZtByiBAbl65NpdsnaNPVlpVTRzgNte8e42427";
const BASE_URL = "https://app.kargoentegrator.com/api";

async function run() {
    console.time("PDF Fetch");
    const shipmentId = "1362623"; // Using order 1806's shipment ID
    const pdfRes = await fetch(`${BASE_URL}/print-pdf?shipments[0]=${shipmentId}`, {
        headers: {
            "Authorization": `Bearer ${API_KEY}`,
            "Accept": "application/pdf"
        }
    });
    console.timeEnd("PDF Fetch");
    console.log("Status:", pdfRes.status);
    const buffer = await pdfRes.arrayBuffer();
    console.log("Size:", buffer.byteLength);
}
run();
