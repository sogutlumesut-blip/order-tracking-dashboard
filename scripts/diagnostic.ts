import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
    console.log("--- DB Health Diagnostic (Fixed) ---")
    try {
        const orderCount = await prisma.order.count()
        const activityCount = await prisma.orderActivity.count()
        const commentCount = await prisma.comment.count()
        const userCount = await prisma.user.count()

        console.log(`Order Count: ${orderCount}`)
        console.log(`Activity Count: ${activityCount}`)
        console.log(`Comment Count: ${commentCount}`)
        console.log(`User Count: ${userCount}`)

        const recentOrders = await prisma.order.findMany({
            take: 5,
            orderBy: { updatedAt: 'desc' },
            select: { id: true, updatedAt: true }
        })
        console.log("Recent Orders:", recentOrders)

    } catch (e) {
        console.error("Diagnostic Error:", e)
    } finally {
        await prisma.$disconnect()
    }
}

main()
