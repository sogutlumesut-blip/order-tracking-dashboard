
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
    console.log("--- DEBUGGING WOOCOMMERCE CONNECTION ---")

    // 1. Get Settings
    const settingsList = await db.systemSetting.findMany()
    const settings = settingsList.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {} as Record<string, string>)

    console.log("Checking Settings...")
    const url = settings['wc_url']
    const key = settings['wc_key']
    const secret = settings['wc_secret']

    if (!url) console.error("❌ URL Missing")
    else console.log("✅ URL:", url)

    if (!key) console.error("❌ Key Missing")
    else console.log("✅ Key Present")

    if (!secret) console.error("❌ Secret Missing")
    else console.log("✅ Secret Present")

    if (!url || !key || !secret) {
        console.error("Stopping due to missing settings.")
        return
    }

    // 2. Try Fetch
    console.log("\nAttempting Fetch (Last 2 Months)...")
    const auth = Buffer.from(`${key}:${secret}`).toString('base64')

    // Using the exact logic from actions.ts
    const targetUrl = `${url}/wp-json/wc/v3/orders?per_page=10&after=2025-12-20T00:00:00`
    console.log(`Target: ${targetUrl}`)

    try {
        const response = await fetch(targetUrl, {
            headers: {
                Authorization: `Basic ${auth}`
            },
            cache: 'no-store'
        })

        console.log(`Response Status: ${response.status} ${response.statusText}`)

        if (!response.ok) {
            console.error("❌ Error Body:", await response.text())
            // Check for common issues
            if (response.status === 401) console.log("--> AUTH ERROR: Keys invalid or server blocking Basic Auth.")
            if (response.status === 404) console.log("--> NOT FOUND: URL looks wrong. Check /wp-json path.")
            return
        }

        const data = await response.json()
        if (Array.isArray(data)) {
            console.log(`✅ Success! Found ${data.length} orders.`)
            if (data.length > 0) {
                console.log("First Order ID:", data[0].id)
                console.log("First Order Date:", data[0].date_created)
                console.log("First Order Status:", data[0].status)
            } else {
                console.log("--> Empty Array returned. Filter might be too restrictive.")
            }
        } else {
            console.error("❌ Unexpected Response Format (Not Array):", data)
        }

    } catch (e: any) {
        console.error("❌ NETWORK ERROR:", e.message)
        if (e.cause) console.error("Cause:", e.cause)
    }
}

main()
    .catch(console.error)
    .finally(() => db.$disconnect())
