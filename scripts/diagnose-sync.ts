
import { PrismaClient } from '@prisma/client'
import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api"
import fs from 'fs'
import path from 'path'

// Manually load env
const envPath = path.resolve(process.cwd(), '.env');
const env: Record<string, string> = {};
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8').split('\n');
    envConfig.forEach((line) => {
        const [key, value] = line.split('=');
        if (key && value) {
            env[key.trim()] = value.trim();
        }
    });
}

// FORCE URL
const dbUrl = env.DATABASE_URL?.replace(/['"]/g, '');

// Create a direct connection with explicit URL
const db = new PrismaClient({
    datasources: {
        db: {
            url: dbUrl
        }
    }
})

async function diagnose() {
    console.log("🔍 Diagnosing Order Sync... (16:55+ Report)")

    try {
        // 1. Get Credentials
        const settings = await db.systemSetting.findMany()
        const config: any = settings.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {})

        if (!config.wc_consumer_key || !config.wc_consumer_secret) {
            console.error("❌ Credentials missing in DB")
            return
        }

        const api = new WooCommerceRestApi({
            url: config.wc_url || "https://duvarkagidimarketi.com",
            consumerKey: config.wc_consumer_key,
            consumerSecret: config.wc_consumer_secret,
            version: "wc/v3"
        })

        // 2. Fetch WC Orders
        console.log("🌍 Fetching last 5 orders from WooCommerce...")
        const { data: wcOrders } = await api.get("orders", { per_page: 5 })

        console.log("\n📦 REMOTE WOOCOMMERCE ORDERS:")
        wcOrders.forEach((o: any) => {
            console.log(`- ID: ${o.id} | Status: ${o.status.toUpperCase()} | Date: ${o.date_created} | Total: ${o.total}`)
            console.log(`  Customer: ${o.billing.first_name} ${o.billing.last_name}`)
        })

        // 3. Fetch Local DB Orders
        console.log("\n💾 LOCAL DATABASE ORDERS:")
        const dbOrders = await db.order.findMany({
            take: 5,
            orderBy: { id: 'desc' }
        })

        dbOrders.forEach((o: any) => {
            console.log(`- ID: ${o.id} | Status: ${o.status.toUpperCase()} | Updated: ${o.updatedAt}`)
            console.log(`  Customer: ${o.customer}`)
        })

        // 4. Comparison
        const latestWcId = wcOrders[0]?.id
        const latestDbId = dbOrders[0]?.id

        console.log("\n⚖️  COMPARISON:")
        console.log(`Latest Remote ID: ${latestWcId}`)
        console.log(`Latest Local ID:  ${latestDbId}`)

        if (latestWcId !== latestDbId) {
            console.log("⚠️  MISMATCH DETECTED! Webhook might be failing. Try manual sync.")
        } else {
            console.log("✅ IDs match. The order IS in the database.")
        }

    } catch (error: any) {
        console.error("Diagnosis failed:", error.message)
    } finally {
        await db.$disconnect()
    }
}

diagnose()
