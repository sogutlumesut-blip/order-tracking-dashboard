
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log("Database Stats Check...")
    try {
        const orderCount = await prisma.order.count()
        const activityCount = await prisma.orderActivity.count()
        const latestOrder = await prisma.order.findFirst({
            orderBy: { updatedAt: 'desc' }
        })
        const latestActivity = await prisma.orderActivity.findFirst({
            orderBy: { timestamp: 'desc' }
        })

        console.log("Order Count:", orderCount)
        console.log("Activity Count:", activityCount)
        console.log("Latest Order Update:", latestOrder?.updatedAt.toISOString())
        console.log("Latest Activity:", latestActivity?.timestamp.toISOString(), latestActivity?.action, latestActivity?.details)

    } catch (e) {
        console.error("Stats FAILED:", e)
    } finally {
        await prisma.$disconnect()
    }
}

main()
