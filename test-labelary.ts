async function run() {
    const url = "http://api.labelary.com/v1/printers/8dpmm/labels/4x6/0/";
    const zpl = "433987709647\n^FO20,750^A0N,18,18^FDSIPARIS ICERIGI: Test^FS\n^FO20,800^A0N,24,24^FDURUN BULUNAMADI^FS\n^XZ";
    
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Accept": "application/pdf",
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: zpl
    });
    
    if (!response.ok) {
        console.error("Error:", await response.text());
    } else {
        console.log("Success! PDF Buffer size:", (await response.arrayBuffer()).byteLength);
    }
}

run().catch(console.error);
