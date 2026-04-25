import { db } from './lib/prisma'
import * as fs from 'fs'

async function run() {
    const item = await db.orderItem.findUnique({ where: { id: 5894077 }});
    if (item && item.image_src) {
        const match = item.image_src.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
        if (match) {
            const buffer = Buffer.from(match[2], 'base64');
            fs.writeFileSync('test-out.jpg', buffer);
            console.log("Wrote test-out.jpg, size:", buffer.length);
        } else {
            console.log("No match");
        }
    }
}
run().catch(console.error)
