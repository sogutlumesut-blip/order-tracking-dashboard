import { db } from './lib/prisma'
async function run() {
    const order = await db.order.findUnique({
        where: { id: 1693 },
        include: { items: true }
    });
    if (order) {
        order.items.forEach(i => {
            console.log(`Item ${i.id} image_src: ${i.image_src.substring(0, 100)}...`);
            console.log(`Length: ${i.image_src.length}`);
        });
    }
}
run().catch(console.error)
