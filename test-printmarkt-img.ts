import { db } from './lib/prisma'
async function run() {
    const orders = await db.order.findMany({
        include: { items: true },
        take: 10,
        orderBy: { id: 'desc' }
    });
    
    orders.forEach(o => {
        o.items.forEach(i => {
            if (i.image_src && !i.image_src.startsWith('data:image')) {
                console.log(`Order ${o.id} - Item ${i.id} image_src: ${i.image_src.substring(0, 100)}... Length: ${i.image_src.length}`);
            }
        });
    });
}
run().catch(console.error)
