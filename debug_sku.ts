
import { db } from "./lib/prisma"

async function checkSkus() {
    const orders = await db.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { items: true }
    })

    console.log("Checking SKUs for last 5 orders:")
    orders.forEach(o => {
        console.log(`Order #${o.id} (${o.barcode}):`)
        o.items.forEach(i => {
            console.log(` - Item: ${i.name}`)
            console.log(`   SKU: '${i.sku}' (Type: ${typeof i.sku})`)
        })
    })
}

checkSkus()
