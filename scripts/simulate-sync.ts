import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
    const settings = await db.systemSetting.findMany()
    const config = settings.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {} as Record<string, string>)
    const auth = Buffer.from(`${config.wc_key}:${config.wc_secret}`).toString('base64')

    const response = await fetch(`${config.wc_url}/wp-json/wc/v3/orders/104162`, {
        headers: { Authorization: `Basic ${auth}` }
    })

    const wcOrder = await response.json()
    console.log("Fetched Order ID:", wcOrder.id)

    const items = (wcOrder.line_items || []).map((item: any) => ({
        name: item.name || 'Ürün',
        quantity: item.quantity || 1,
        image_src: item.image?.src || "https://placehold.co/600x400?text=Urun+Gorseli",
        dimensions: Array.isArray(item.meta_data) ? item.meta_data.find((m: any) => m.key === 'boyut' || m.key === 'olculer' || m.key === 'Dimensions')?.value : null,
        material: Array.isArray(item.meta_data) ? item.meta_data.find((m: any) => m.key === 'malzeme' || m.key === 'kagit_turu' || m.key === 'Material')?.value : null
    }))

    console.log("Mapped Items:", items)

    try {
        const order = await db.order.create({
            data: {
                customer: `${wcOrder.billing.first_name || ''} ${wcOrder.billing.last_name || ''}`.trim() || 'Misafir',
                total: `${wcOrder.total} ${wcOrder.currency_symbol}`,
                status: 'pending',
                date: new Date(wcOrder.date_created),
                updatedAt: new Date(wcOrder.date_modified),
                barcode: `WC-${wcOrder.id}`,
                email: wcOrder.billing.email,
                phone: wcOrder.billing.phone,
                address: `${wcOrder.billing.address_1 || ''} ${wcOrder.billing.address_2 || ''}`.trim(),
                city: wcOrder.billing.city,
                note: wcOrder.customer_note,
                labels: JSON.stringify(['WooCommerce']),
                hasNotification: true,
                items: {
                    create: items
                }
            }
        })
        console.log("SUCCESS! Created Order ID:", order.id)
    } catch (e) {
        console.error("PRISMA ERROR:", e)
    }
}

main()
    .finally(async () => {
        await db.$disconnect()
    })
