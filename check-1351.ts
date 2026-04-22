import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function run() {
    const order = await db.order.findUnique({ where: { id: 1351 } })
    console.log("Order 1351 details:")
    console.log("City:", order?.city)
    console.log("Address:", order?.address)
}

run().catch(console.error).finally(() => db.$disconnect())
