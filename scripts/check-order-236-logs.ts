
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const orderId = 236;
    console.log(`Checking activity logs for Order #${orderId}...`)
    try {
        const activities = await prisma.orderActivity.findMany({
            where: { orderId },
            orderBy: { timestamp: 'desc' },
            take: 10
        })

        console.table(activities.map(a => ({
            time: a.timestamp.toISOString(),
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
