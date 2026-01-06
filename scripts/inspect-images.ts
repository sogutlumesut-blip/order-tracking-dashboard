import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
    const settings = await db.systemSetting.findMany()
    const config = settings.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {} as Record<string, string>)
    const auth = Buffer.from(`${config.wc_key}:${config.wc_secret}`).toString('base64')

    // Fetch the order we know exists (104162)
    const response = await fetch(`${config.wc_url}/wp-json/wc/v3/orders/104162`, {
        headers: { Authorization: `Basic ${auth}` }
    })

    const wcOrder = await response.json()

    console.log("--- Order Items Images ---")
    if (wcOrder.line_items) {
        wcOrder.line_items.forEach((item: any) => {
            console.log(`Item: ${item.name}`)
            console.log("Image Object:", JSON.stringify(item.image, null, 2))
            console.log("Meta Data:", JSON.stringify(item.meta_data, null, 2))
        })
    } else {
        console.log("No line items found.")
    }
}

main()
    .finally(async () => {
        await db.$disconnect()
    })
