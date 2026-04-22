import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function run() {
    const o1 = await db.order.findUnique({ where: { id: 1351 } })
    const o2 = await db.order.findUnique({ where: { id: 1352 } })
    
    console.log("--- 1351 ---")
    console.log(JSON.stringify(o1, null, 2))
    console.log("--- 1352 ---")
    console.log(JSON.stringify(o2, null, 2))
}

run().catch(console.error).finally(() => db.$disconnect())
