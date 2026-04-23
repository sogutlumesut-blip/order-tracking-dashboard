import { db } from "./lib/prisma";

async function run() {
    const order = await db.order.findUnique({
        where: { id: 1649 },
        select: { id: true, cargoBarcode: true, cargoTrackingNumber: true, barcode: true, note: true, customer: true, items: { select: { name: true, quantity: true, sku: true, material: true, dimensions: true } } }
    });

    if (!order || !order.cargoBarcode) {
        console.log("No ZPL found for 1649");
        return;
    }

    let zpl = order.cargoBarcode;
    
    // Check if it's ZPL
    if (!zpl.includes('^XA')) {
        console.log("cargoBarcode is not ZPL. It is:", zpl);
        return;
    }

    const cleanTR = (text: string) => {
        if (!text) return "";
        return text.replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
            .replace(/Ü/g, 'U').replace(/ü/g, 'u')
            .replace(/Ş/g, 'S').replace(/ş/g, 's')
            .replace(/İ/g, 'I').replace(/ı/g, 'i')
            .replace(/Ö/g, 'O').replace(/ö/g, 'o')
            .replace(/Ç/g, 'C').replace(/ç/g, 'c')
            .toUpperCase();
    };

    let itemsZpl = "";
    let currentY = 780; 

    if (order.items && order.items.length > 0) {
        order.items.forEach((item: any) => {
            if (currentY > 1150) return; 

            const rawName = cleanTR(item.name);
            const isMultiline = rawName.length > 40;

            itemsZpl += `^FO20,${currentY}^A0N,22,22^FB640,2,2,L,0^FD${rawName}^FS\n`;
            itemsZpl += `^FO670,${currentY}^A0N,28,28^FB100,1,0,R,0^FDx ${item.quantity}^FS\n`;
            currentY += isMultiline ? 45 : 25;

            let details = [];
            if (item.sku) details.push(`KOD: ${item.sku}`);
            if (item.material) details.push(cleanTR(item.material).substring(0, 30));
            if (item.dimensions) details.push(cleanTR(item.dimensions));
            
            itemsZpl += `^FO20,${currentY}^A0N,18,18^FB760,1,0,L,0^FD${details.join('   -   ')}^FS\n`;

            currentY += 35; 
        });
    } else {
        itemsZpl = `^FO20,${currentY}^A0N,24,24^FDURUN BULUNAMADI^FS\n`;
        currentY += 35;
    }

    const dividerY = currentY + 5;
    const qrY = dividerY + 15;

    const trackingNoSafe = order.cargoTrackingNumber || order.barcode || order.id.toString();
    const systemQrData = order.barcode || order.id.toString();
    const noteSafe = cleanTR(order.note || "NOT: YOK").substring(0, 90);
    const customerSafe = cleanTR(order.customer).substring(0, 45);

    const customReceiptZpl = `
^FO20,750^A0N,18,18^FDSIPARIS ICERIGI: ${customerSafe}^FS

${itemsZpl}

^FO20,${dividerY}^GB760,2,2^FS

^FO20,${qrY}^A0N,18,18^FDSISTEM (QR)^FS
^FO20,${qrY + 25}^BQN,2,3^FDQA,${systemQrData}^FS
^FO20,${qrY + 115}^A0N,16,16^FD${systemQrData}^FS

^FO360,${qrY}^A0N,18,18^FDKARGO (DHL/STANDART)^FS
^FO360,${qrY + 25}^BY2,2,60^BCN,60,Y,N,N^FD${trackingNoSafe}^FS

^FO20,${qrY + 145}^A0N,20,20^FB760,2,2,L,0^FDMUSTERI NOTU: ${noteSafe}^FS
`;

    if (zpl.includes('^XZ')) {
        zpl = zpl.replace('^XZ', customReceiptZpl + '\n^XZ');
    } else {
        zpl = zpl + "\n" + customReceiptZpl;
    }

    const url = "http://api.labelary.com/v1/printers/8dpmm/labels/4x6/0/";
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Accept": "application/pdf",
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: zpl 
    });

    if (!response.ok) {
        console.error("Labelary Error:", await response.text());
    } else {
        console.log("Success! PDF Buffer generated.");
    }
}

run().catch(console.error);
