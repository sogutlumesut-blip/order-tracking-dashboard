import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const activities = await prisma.orderActivity.findMany({
    where: { action: 'CARGO_START' },
    orderBy: { timestamp: 'desc' },
    take: 10
  })
  console.log(JSON.stringify(activities, null, 2))
}
main().finally(() => prisma.$disconnect())
