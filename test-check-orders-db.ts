import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function run() {
    const ids = ['110001', '109999', '109997', 'pm_1647', 'pm_1646', 'pm_1645'];
    
    console.log("Checking DB for specific orders...");
    for (const id of ids) {
        // Try checking both externalId and barcode
        const order = await db.order.findFirst({
            where: {
                OR: [
                    { externalId: id },
                    { barcode: `WC-${id}` },
                    { barcode: id }
                ]
            },
            select: {
                id: true,
                externalId: true,
                barcode: true,
                customer: true,
                status: true,
                source: true,
                date: true
            }
        });
        if (order) {
            console.log(`FOUND: ID: ${id} | DB ID: ${order.id} | Barcode: ${order.barcode} | ExtID: ${order.externalId} | Cust: ${order.customer} | Status: ${order.status} | Source: ${order.source} | Date: ${order.date}`);
        } else {
            console.log(`NOT FOUND: ID: ${id}`);
        }
    }
}
run().finally(() => db.$disconnect());
