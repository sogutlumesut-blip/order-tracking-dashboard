import { db } from './lib/prisma'
async function run() {
    const item = await db.orderItem.findUnique({ where: { id: 5894077 }});
    if (item && item.image_src) {
        console.log("Has newline:", item.image_src.includes('\n'));
        console.log("Has carriage return:", item.image_src.includes('\r'));
    }
}
run().catch(console.error)
