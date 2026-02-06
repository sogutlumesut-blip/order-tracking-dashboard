
import { db } from "../lib/prisma"

async function main() {
    const ordersWithCargo = await db.order.findMany({
        where: {
            cargoBarcode: { not: null }
        },
        take: 5
    })

    const totalOrders = await db.order.count()

    console.log(`Total Orders: ${totalOrders}`)
    console.log(`Orders with Cargo Barcode: ${ordersWithCargo.length}`)

    if (ordersWithCargo.length > 0) {
        console.log("Sample:", ordersWithCargo[0])
    } else {
        console.log("No cargo data found. Sync logic might not be finding '_gcargo' keys, or plugin is not used.")
    }
}

main()
