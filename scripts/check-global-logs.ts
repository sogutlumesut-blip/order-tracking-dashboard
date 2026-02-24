
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log("Checking recent activity logs for ALL orders...")
    try {
        const activities = await prisma.orderActivity.findMany({
            orderBy: { timestamp: 'desc' },
            take: 20
        })

        console.table(activities.map(a => ({
            time: a.timestamp.toISOString(),
            order: a.orderId,
            action: a.action,
            details: a.details.substring(0, 100)
        })))
    } catch (e) {
        console.error("Fetch FAILED:", e)
    } finally {
        await prisma.$disconnect()
    }
}

main()
