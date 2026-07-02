import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function run() {
    const pmOrders = await db.order.findMany({
        where: { source: 'PrintMarkt' },
        select: { id: true, externalId: true, customer: true, status: true, items: true, createdAt: true },
        orderBy: { createdAt: 'desc' }
    });
    
    console.log(`Total PrintMarkt orders in DB: ${pmOrders.length}`);
    pmOrders.slice(0, 20).forEach((o: any) => {
        const itemNames = o.items.map((i: any) => i.name).join(', ');
        console.log(`ID: ${o.id} | ExtID: ${o.externalId} | Status: ${o.status} | Customer: ${o.customer} | Items: ${itemNames.substring(0, 30)}...`);
    });
}
run().finally(() => db.$disconnect());
