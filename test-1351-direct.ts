import { db } from './lib/prisma'
import { createDHLShipmentAction } from './app/actions'
import fs from "fs";

async function run() {
    const orderId = 1661;
    // reset status and tracking
    await db.order.update({
        where: { id: orderId },
        data: { 
            cargoBarcode: null,
            cargoTrackingNumber: null,
            cargoLabelPdf: null
        }
    });
    
    console.log(`Running createDHLShipmentAction for ${orderId}...`)
    const res = await createDHLShipmentAction(orderId, true)
    console.log("Result:", res)

    if (res.success) {
        const order = await db.order.findUnique({ where: { id: orderId } });
        if (order?.cargoLabelPdf && order.cargoLabelPdf.startsWith("data:application/pdf")) {
            console.log("PDF generated successfully! Length:", order.cargoLabelPdf.length);
            const base64Data = order.cargoLabelPdf.replace('data:application/pdf;base64,', '');
            const pdfBuffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync("final-pdf-1661.pdf", pdfBuffer);
            console.log("Written to final-pdf-1661.pdf");
        }
    }
}

run().catch(console.error)
