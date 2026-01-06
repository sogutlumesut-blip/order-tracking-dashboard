import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
    const orders = await db.order.findMany({
        where: {
            customer: { contains: 'Beyzanur' }
        }
    })

    if (orders.length > 0) {
        console.log(`Found Order for Beyzanur: ID=${orders[0].id} Barcode=${orders[0].barcode}`)
    } else {
        console.log("Order not found.")
    }
}

main()
    .finally(async () => {
        await db.$disconnect()
    })
