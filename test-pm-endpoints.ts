import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function testEndpoint(url: string, key: string) {
    try {
        console.log(`Testing: ${url}`);
        const res = await fetch(url, {
            headers: { "X-API-Key": key }
        });
        console.log(`Status: ${res.status}`);
        const text = await res.text();
        console.log(`Response (first 200 chars): ${text.substring(0, 200)}`);
    } catch (e: any) {
        console.error(`Error testing ${url}:`, e.message);
    }
}

async function run() {
    const settings = await db.systemSetting.findMany();
    const pmUrl = settings.find(s => s.key === 'pm_url')?.value;
    const pmKey = settings.find(s => s.key === 'pm_key')?.value;

    if (!pmUrl || !pmKey) {
        console.error("PrintMarkt settings missing!");
        return;
    }

    const cleanUrl = pmUrl.replace(/\/+$/, '');
    await testEndpoint(`${cleanUrl}/api/webhooks`, pmKey);
    await testEndpoint(`${cleanUrl}/api/webhook`, pmKey);
    await testEndpoint(`${cleanUrl}/api/settings`, pmKey);
    await testEndpoint(`${cleanUrl}/api/profile`, pmKey);
    await testEndpoint(`${cleanUrl}/api/dealer`, pmKey);
}

run().catch(console.error).finally(() => db.$disconnect());
