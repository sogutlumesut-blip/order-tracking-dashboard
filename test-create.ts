import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function run() {
    try {
        const orderData = {
            customer: "Test Customer",
            phone: "0555",
            email: "test@test.com",
            address: "Test Address",
            city: "Test City",
            note: "Test Note",
            status: "pending_woo",
            items: [{
                name: "Test Item",
                sku: "TEST-01",
                quantity: 1,
                image_src: "https://example.com/image.jpg",
                material: "Test Material",
                dimensions: "100 x 100 cm",
                url: "https://example.com/pdf.pdf"
            }]
        };

        const { items, customer, phone, email, address, city, note, status } = orderData;
        const barcode = `MANUAL-${Date.now()}`;

        const newOrder = await db.order.create({
            data: {
                customer,
                phone,
                email,
                address,
                city,
                note,
                total: "0.00 ₺",
                status: status || "pending_woo",
                barcode,
                labels: JSON.stringify(['Manuel']),
                hasNotification: true,
                items: {
                    create: items
                }
            }
        });
        
        console.log("Success", newOrder.id);
    } catch (e) {
        console.error("Error:", e);
    } finally {
        await db.$disconnect();
    }
}
run();
