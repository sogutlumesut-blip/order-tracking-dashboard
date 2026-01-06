import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
    const orders = await db.order.findMany({
        where: {
            barcode: { in: ['WC-104166', 'WC-104016'] }
        },
        include: { items: true }
    })

    orders.forEach(o => {
        console.log(`Order ${o.barcode} (${o.customer}):`)
        o.items.forEach(i => {
            console.log(` - Item: ${i.name}`)
            console.log(`   SKU: ${i.sku}`)
            console.log(`   Dims: ${i.dimensions}`)
        })
    })
}

main()
    .finally(async () => {
        await db.$disconnect()
    })
