import { GET } from './app/api/order-image/[itemId]/route'
import { NextRequest } from 'next/server'

async function run() {
    const req = new NextRequest('http://localhost/api/order-image/5894077');
    const res = await GET(req, { params: { itemId: '5894077' } });
    console.log("Status:", res.status);
    console.log("Content-Type:", res.headers.get('content-type'));
    if (res.status !== 200) {
        console.log("Body:", await res.text());
    }
}
run().catch(console.error)
