import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function run() {
    const ids = ['110001', '109999', '109997'];
    
    console.log("Checking activities for orders...");
    for (const id of ids) {
        const order = await db.order.findFirst({
            where: {
                OR: [
                    { externalId: id },
                    { barcode: `WC-${id}` },
                    { barcode: id }
                ]
            }
        });
        
        if (order) {
            console.log(`\nOrder ${id} (DB ID: ${order.id}):`);
            const activities = await db.orderActivity.findMany({
                where: { orderId: order.id },
                orderBy: { timestamp: 'asc' }
            });
            activities.forEach((act: any) => {
                console.log(`  [${act.timestamp}] ${act.author}: [${act.action}] ${act.details}`);
            });
        } else {
            console.log(`Order ${id} NOT found.`);
        }
    }
}
run().finally(() => db.$disconnect());
