import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
    const settings = await db.systemSetting.findMany()
    const config = settings.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {} as Record<string, string>)
    const auth = Buffer.from(`${config.wc_key}:${config.wc_secret}`).toString('base64')

    const response = await fetch(`${config.wc_url}/wp-json/wc/v3/orders/104016`, {
        headers: { Authorization: `Basic ${auth}` }
    })

    const wcOrder = await response.json()

    wcOrder.line_items.forEach((item: any) => {
        console.log(`\nItem: ${item.name}`)
        console.log(`SKU: "${item.sku}"`)
        console.log(`Product ID: ${item.product_id}`)
        console.log("Meta Data Keys:", item.meta_data.map((m: any) => m.key))

        const width = item.meta_data.find((m: any) => m.key === 'Width' || m.key === 'Genişlik')?.value
        const height = item.meta_data.find((m: any) => m.key === 'Height' || m.key === 'Yükseklik')?.value
        const area = item.meta_data.find((m: any) => m.key === 'Area' || m.key === 'Toplam Ölçü')?.value

        console.log(`Width: ${width}, Height: ${height}, Area: ${area}`)
    })
}

main()
    .finally(async () => {
        await db.$disconnect()
    })
