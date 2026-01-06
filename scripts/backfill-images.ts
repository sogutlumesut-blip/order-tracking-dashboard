import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
    const settings = await db.systemSetting.findMany()
    const config = settings.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {} as Record<string, string>)
    const auth = Buffer.from(`${config.wc_key}:${config.wc_secret}`).toString('base64')

    const orders = await db.order.findMany({
        where: {
            barcode: { startsWith: 'WC-' }
        },
        include: {
            items: true
        }
    })

    console.log(`Found ${orders.length} WC orders to check.`)

    for (const order of orders) {
        if (!order.barcode) continue
        const wcId = order.barcode.replace('WC-', '')

        try {
            const res = await fetch(`${config.wc_url}/wp-json/wc/v3/orders/${wcId}`, {
                headers: { Authorization: `Basic ${auth}` }
            })

            if (!res.ok) continue
            const wcOrder = await res.json()

            // Iterate over DB items and find matching WC items (by index or name?)
            // Since order items are usually in sync, we can just replace all of them based on index or just update.
            // For simplicity, let's look at the first line_item since most orders seem to have 1 item or correspond 1-to-1.

            let updatedCount = 0;
            for (let i = 0; i < (wcOrder.line_items || []).length; i++) {
                const wcItem = wcOrder.line_items[i]
                // Find corresponding DB item (assuming order is preserved or single item)
                // This is tricky if items changed, but usually they are created once.
                // Let's assume the DB items are in similar order or just update the first one if length matches.

                if (order.items[i]) {
                    const dbItem = order.items[i]

                    let imageSrc = wcItem.image?.src;
                    if (!imageSrc && wcItem.meta_data) {
                        const metaImg = wcItem.meta_data.find((m: any) => m.key === 'Ürün Görselleri');
                        if (metaImg && metaImg.value) {
                            const match = metaImg.value.match(/src=["'](.*?)["']/) || metaImg.value.match(/href=["'](.*?)["']/);
                            if (match && match[1]) {
                                imageSrc = match[1];
                            }
                        }
                    }

                    if (imageSrc && imageSrc !== dbItem.image_src && !imageSrc.includes('placehold.co')) {
                        await db.orderItem.update({
                            where: { id: dbItem.id },
                            data: { image_src: imageSrc }
                        })
                        updatedCount++
                    }
                }
            }
            if (updatedCount > 0) console.log(`Updated images for Order ${wcId}`)

        } catch (e) {
            console.error(`Failed to update ${wcId}`, e)
        }
    }
}

main()
    .finally(async () => {
        await db.$disconnect()
    })
