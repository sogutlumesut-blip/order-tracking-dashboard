import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function run() {
  const o = await prisma.order.findUnique({where: {id: 1265}})
  console.log("Order 1265:", JSON.stringify(o, null, 2))
}
run()
