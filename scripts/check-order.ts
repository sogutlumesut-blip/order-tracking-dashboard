import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
    const order = await db.order.findFirst({
        where: {
            barcode: 'WC-104162'
        }
    })

    if (order) {
        console.log("ORDER FOUND IN DB!")
        console.log("ID:", order.id)
        console.log("Customer:", order.customer)
        console.log("Status:", order.status)
    } else {
        console.log("ORDER NOT FOUND IN DB.")
    }
}

main()
    .finally(async () => {
        await db.$disconnect()
    })
