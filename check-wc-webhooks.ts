import { PrismaClient } from '@prisma/client';
import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

const db = new PrismaClient();

async function run() {
    const settings = await db.systemSetting.findMany();
    const wcUrl = settings.find(s => s.key === 'wc_url')?.value;
    const wcKey = settings.find(s => s.key === 'wc_key')?.value;
    const wcSecret = settings.find(s => s.key === 'wc_secret')?.value;

    if (!wcUrl || !wcKey || !wcSecret) {
        console.error("WooCommerce credentials missing!");
        return;
    }

    console.log("Connecting to WooCommerce:", wcUrl);
    const WooCommerce = new (WooCommerceRestApi as any)({
        url: wcUrl,
        consumerKey: wcKey,
        consumerSecret: wcSecret,
        version: "wc/v3"
    });

    try {
        const res = await WooCommerce.get("webhooks");
        console.log(`Found ${res.data.length} webhooks:`);
        res.data.forEach((w: any) => {
            console.log(`ID: ${w.id}, Name: ${w.name}, Status: ${w.status}, Delivery URL: ${w.delivery_url}`);
        });
    } catch (e: any) {
        console.error("Error fetching webhooks:", e.message);
    }
}

run().catch(console.error).finally(() => db.$disconnect());
