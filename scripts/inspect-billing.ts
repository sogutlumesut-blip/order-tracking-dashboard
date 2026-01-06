import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
    const settings = await db.systemSetting.findMany()
    const config = settings.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {} as Record<string, string>)
    const auth = Buffer.from(`${config.wc_key}:${config.wc_secret}`).toString('base64')

    // Fetch Order 104165 (Nezihe Eryilmaz)
    const response = await fetch(`${config.wc_url}/wp-json/wc/v3/orders/104165`, {
        headers: { Authorization: `Basic ${auth}` }
    })

    const wcOrder = await response.json()
    console.log(`Order #${wcOrder.id}`)
    console.log("Billing City:", wcOrder.billing.city)
    console.log("Billing State:", wcOrder.billing.state)
    console.log("Billing Postcode:", wcOrder.billing.postcode)
    console.log("Full Billing Object:", JSON.stringify(wcOrder.billing, null, 2))
}

main()
    .finally(async () => {
        await db.$disconnect()
    })
