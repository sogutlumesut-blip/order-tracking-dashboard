import { db } from './lib/prisma';

async function main() {
    console.log("Creating dummy order...");
    const barcode = `MANUAL-${Date.now()}`;
    const start = Date.now();
    const order = await db.order.create({
        data: {
            customer: "Test",
            phone: "Test",
            email: "test@test.com",
            address: "Test",
            city: "Test",
            note: "Test",
            total: "0.00 ₺",
            status: "pending_woo",
            barcode,
            labels: JSON.stringify(['Manuel']),
            hasNotification: true,
            items: {
                create: [{
                    name: "Test item",
                    quantity: 1,
                    // Simulate 3MB image
                    image_src: "data:image/jpeg;base64," + "A".repeat(3000000),
                    url: "data:application/pdf;base64," + "B".repeat(400000)
                }]
            }
        }
    });
    console.log(`Created in ${Date.now() - start}ms:`, order.id);
}
main().catch(console.error);
