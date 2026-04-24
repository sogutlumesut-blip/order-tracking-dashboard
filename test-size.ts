import { db } from './lib/prisma'
async function run() {
    const orderItem = await db.orderItem.findFirst({
        where: { image_src: { startsWith: 'data:image' } }
    });
    console.log(orderItem ? 'Found base64 image!' : 'No base64 images found');
}
run().catch(console.error)
