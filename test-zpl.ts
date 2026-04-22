import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const order = await prisma.order.findUnique({
    where: { id: 1132 },
    select: { cargoBarcode: true }
  })
  console.log(order?.cargoBarcode?.substring(0, 300))
}
main().finally(() => prisma.$disconnect())
