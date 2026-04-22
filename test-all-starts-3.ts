import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const activities = await prisma.orderActivity.findMany({
    orderBy: { timestamp: 'desc' },
    take: 3
  })
  console.log(JSON.stringify(activities, null, 2))
}
main().finally(() => prisma.$disconnect())
