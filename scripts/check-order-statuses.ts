
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log("Checking last 10 orders statuses...")
    const orders = await prisma.order.findMany({
        take: 10,
        orderBy: { updatedAt: 'desc' },
        select: { id: true, status: true, customer: true }
    })
    console.table(orders)
    await prisma.$disconnect()
}

main()
