import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const order = await prisma.order.findUnique({
    where: { id: 1133 },
    include: { activities: { orderBy: { timestamp: 'desc' }, take: 10 } }
  })
  console.log(JSON.stringify(order, null, 2))
}
main().finally(() => prisma.$disconnect())
