import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
    const settings = await db.systemSetting.findMany()
    const config = settings.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {} as Record<string, string>)
    const auth = Buffer.from(`${config.wc_key}:${config.wc_secret}`).toString('base64')

    // Fetch a recent order to check metadata
    const response = await fetch(`${config.wc_url}/wp-json/wc/v3/orders?per_page=1`, {
        headers: { Authorization: `Basic ${auth}` }
    })

    const orders = await response.json()
    if (orders.length === 0) {
        console.log("No orders found.")
        return
    }

    const wcOrder = orders[0]
    console.log(`Checking Order #${wcOrder.id} - ${wcOrder.billing.first_name}`)

    wcOrder.line_items.forEach((item: any, index: number) => {
        console.log(`\nItem ${index + 1}: ${item.name}`)
        console.log("Meta Data Keys:")
        item.meta_data.forEach((m: any) => {
            console.log(`Key: "${m.key}" | Display Key: "${m.display_key}" | Value: "${m.value}"`)
        })
    })
}

main()
    .finally(async () => {
        await db.$disconnect()
    })
