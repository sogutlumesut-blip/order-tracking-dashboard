import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
    const settings = await db.systemSetting.findMany()
    const config = settings.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {} as Record<string, string>)

    console.log("Config:", config)

    if (!config.wc_url || !config.wc_key || !config.wc_secret) {
        console.error("Missing config")
        return
    }

    const auth = Buffer.from(`${config.wc_key}:${config.wc_secret}`).toString('base64')
    const url = `${config.wc_url}/wp-json/wc/v3/orders?per_page=1&after=2025-12-20T00:00:00`

    console.log("Fetching URL:", url)

    try {
        const response = await fetch(url, {
            headers: {
                Authorization: `Basic ${auth}`
            }
        })

        const data = await response.json()
        console.log("Status:", response.status)
        console.log("Orders Found:", data.length)

        if (Array.isArray(data) && data.length > 0) {
            console.log("First Order Date:", data[0].date_created)
            console.log("First Order ID:", data[0].id)
            console.log("Billing Data:", JSON.stringify(data[0].billing, null, 2))
        } else {
            console.log("NO ORDERS FOUND for this date range.")
            if (!Array.isArray(data)) console.log("Response is NOT an array:", data)
        }

        if (!response.ok) {
            console.error("FAILED")
        } else {
            console.log("SUCCESS")
        }

    } catch (e) {
        console.error("Network/Fetch Error:", e)
    }
}

main()
    .finally(async () => {
        await db.$disconnect()
    })
