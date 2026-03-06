import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function run() {
    const url = await db.systemSetting.findUnique({ where: { key: "pm_url" } });
    const key = await db.systemSetting.findUnique({ where: { key: "pm_key" } });

    console.log("pm_url:", url?.value);
    console.log("pm_key:", key?.value?.slice(0, 5) + "...");

    if (!url || !key) {
        console.error("Missing DB credentials");
        return;
    }

    const cleanUrl = url.value.replace(/\/+$/, '');
    console.log("Fetching from:", `${cleanUrl}/api/orders`);
    let res = await fetch(`${cleanUrl}/api/orders`, {
        headers: { "X-API-Key": key.value }
    });

    if (res.status === 401 || res.status === 403) {
        console.log("X-API-Key failed, trying Authorization: Bearer");
        res = await fetch(`${cleanUrl}/api/orders`, {
            headers: { "Authorization": `Bearer ${key.value}` }
        });
    }

    const json = await res.json();

    if (Array.isArray(json) && json.length > 0) {
        console.log("Found", json.length, "orders.");
        console.log("Sample format:", JSON.stringify(json[0], null, 2));
    } else {
        console.log("Response:", JSON.stringify(json, null, 2));
    }

    await db.$disconnect();
}

run().catch(console.error);
