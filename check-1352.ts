import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function run() {
    const order = await db.order.findUnique({ where: { id: 1352 } })
    console.log("Order 1352 details:")
    console.log("City:", order?.city)
    console.log("Address:", order?.address)
}

run().catch(console.error).finally(() => db.$disconnect())
