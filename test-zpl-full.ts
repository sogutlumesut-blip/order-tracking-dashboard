import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const order = await prisma.order.findUnique({
    where: { id: 1132 },
    select: { cargoBarcode: true }
  })
  console.log(order?.cargoBarcode)
}
main().finally(() => prisma.$disconnect())
