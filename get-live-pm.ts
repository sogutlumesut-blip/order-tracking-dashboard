import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'

const db = new PrismaClient();

async function run() {
    const settings = await db.systemSetting.findMany();
    const pmUrlMap = settings.find(s => s.key === 'pm_url')?.value;
    const pmKeyMap = settings.find(s => s.key === 'pm_key')?.value;

    if (pmUrlMap && pmKeyMap) {
        let cleanUrl = pmUrlMap.replace(/\/+$/, '');
        console.log(`Using Key: ${pmKeyMap.substring(0, 10)}... for ${cleanUrl}`);
        let response = await fetch(`${cleanUrl}/api/orders?_t=${Date.now()}`, {
            headers: { "X-API-Key": pmKeyMap }
        });
        const orders = await response.json();
        fs.writeFileSync('pm-orders.json', JSON.stringify(orders, null, 2));
        console.log("Saved to pm-orders.json, length: ", orders.length);
    } else {
        console.log("Error: DB settings not found.");
    }
}
run().finally(() => db.$disconnect());
