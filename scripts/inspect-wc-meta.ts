
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const urlSetting = await prisma.systemSetting.findUnique({ where: { key: 'wc_url' } })
    const keySetting = await prisma.systemSetting.findUnique({ where: { key: 'wc_key' } })
    const secretSetting = await prisma.systemSetting.findUnique({ where: { key: 'wc_secret' } })

    if (!urlSetting || !keySetting || !secretSetting) {
        console.error("WC credentials missing")
        return
    }

    const auth = Buffer.from(`${keySetting.value}:${secretSetting.value}`).toString('base64')

    // Fetch last 5 orders
    const response = await fetch(`${urlSetting.value}/wp-json/wc/v3/orders?per_page=5`, {
        headers: { Authorization: `Basic ${auth}` }
    })

    if (!response.ok) {
        console.error("Failed to fetch orders:", await response.text())
        return
    }

    const orders = await response.json()

    for (const order of orders) {
        console.log(`\n--- Order #${order.id} ---`)
        console.log("Meta Data:")
        order.meta_data.forEach((m: any) => {
            const val = typeof m.value === 'object' ? JSON.stringify(m.value) : m.value
            console.log(`[${m.key}]: ${val}`)
        });
    }
}

main().catch(console.error).finally(() => prisma.$disconnect())
