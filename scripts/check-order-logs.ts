
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const orderId = 236
    console.log(`Checking logs for Order #${orderId}...`)
    try {
        const activities = await prisma.orderActivity.findMany({
            where: { orderId },
            orderBy: { timestamp: 'desc' }
        })
        console.table(activities.map(a => ({
            id: a.id,
            time: a.timestamp.toISOString(),
            action: a.action,
            details: a.details
        })))
    } catch (e) {
        console.error("Fetch FAILED:", e)
    } finally {
        await prisma.$disconnect()
    }
}

main()
