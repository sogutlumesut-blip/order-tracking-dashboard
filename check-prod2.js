const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const db = new PrismaClient();

async function run() {
    console.log("DB URL Check:", process.env.DATABASE_URL ? "Exists" : "Missing");
    const settings = await db.systemSetting.findMany();
    const pmUrlMap = settings.find(s => s.key === 'pm_url')?.value;
    const pmKeyMap = settings.find(s => s.key === 'pm_key')?.value;
    
    console.log("PrintMarkt URL:", pmUrlMap);
    console.log("PrintMarkt Key (start):", pmKeyMap ? pmKeyMap.substring(0, 5) : 'none');
    
    if (pmUrlMap && pmKeyMap) {
        let cleanUrl = pmUrlMap.replace(/\/+$/, '');
        let response = await fetch(`${cleanUrl}/api/orders?_t=${Date.now()}`, {
            headers: { "X-API-Key": pmKeyMap }
        });
        const orders = await response.json();
        fs.writeFileSync('pm-orders.json', JSON.stringify(orders, null, 2));
        console.log("Saved to pm-orders.json, total orders: ", orders.length);
    }
}
run().catch(console.error).finally(() => db.$disconnect());
