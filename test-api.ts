import { db } from './lib/prisma'
import { GET } from './app/api/order-image/[itemId]/route'
import { NextRequest } from 'next/server'

async function run() {
    const item = await db.orderItem.findFirst({ where: { image_src: { startsWith: 'data:image' } }});
    if(item) {
       const req = new NextRequest(`http://localhost/api/order-image/${item.id}`);
       const res = await GET(req, { params: { itemId: item.id.toString() } });
       console.log(res.status);
       console.log(res.headers.get('content-type'));
    }
}
run().catch(console.error)
