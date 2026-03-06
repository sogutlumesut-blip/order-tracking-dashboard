import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function run() {
    const mockOrder = {
        id: "1772722898173",
        order_number: "ORD-1772722898173",
        account_name: "Tashi Tsering",
        account_email: "info@tashistudio.com",
        status: "shipped",
        payment_method: "PayPal",
        total_price: "23.00",
        currency: "USD",
        customer_note: "IMPORTANT : 19\" x 39\" SAMPLE Size!",
        shipping_address: {
            name: "Stephanie Wright",
            address1: "808 275",
            city: "SAMMAMISH",
            province: "Washington (WA)",
            zip: "98075",
            country: "US",
            phone: ""
        },
        line_items: [
            {
                name: "Custom Print Order",
                quantity: 1,
                price: "23.00",
                material: "peel-stick",
                dimensions: "x IN",
                image_url: "https://example.com/mock.jpg"
            }
        ]
    };

    const pmOrders = [mockOrder];
    let importedCount = 0;

    for (const pmOrder of pmOrders) {
        try {
            const externalId = pmOrder.id;
            const orderNumber = pmOrder.order_number;

            let shippingName = pmOrder.shipping_address.name;
            let shippingAddress = `${pmOrder.shipping_address.address1} ${pmOrder.shipping_address.city} ${pmOrder.shipping_address.province} ${pmOrder.shipping_address.zip} ${pmOrder.shipping_address.country}`.trim();

            const items = pmOrder.line_items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                sku: "",
                image_src: item.image_url || "",
                material: item.material || "",
                dimensions: item.dimensions || ""
            }));

            console.log(`Simulating insertion of PM Order ${orderNumber} for ${shippingName} at ${shippingAddress}...`);

            await db.order.create({
                data: {
                    externalId: `pm_${externalId}`,
                    source: "PrintMarkt",
                    customer: shippingName,
                    email: pmOrder.account_email,
                    phone: pmOrder.shipping_address.phone,
                    address: shippingAddress,
                    total: pmOrder.total_price,
                    paymentMethod: pmOrder.payment_method,
                    status: pmOrder.status,
                    note: pmOrder.customer_note,
                    labels: "",
                    items: { create: items }
                }
            });

            importedCount++;
            console.log("SUCCESS!");

            // Clean up the mock order so it doesn't pollute the real db
            await db.order.deleteMany({ where: { externalId: `pm_${externalId}` } });

        } catch (err) {
            console.error(`Error mapping PrintMarkt order:`, err);
        }
    }

    await db.$disconnect();
}

run().catch(console.error);
