
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log("Checking all recent diagnostic logs for today...")
    try {
        const activities = await prisma.orderActivity.findMany({
            orderBy: { timestamp: 'desc' },
            take: 20
        })

        if (activities.length === 0) {
            console.log("No logs found at all.")
        } else {
            console.table(activities.map(a => ({
                id: a.id,
                time: a.timestamp.toISOString(),
                orderId: a.orderId,
                action: a.action,
                details: a.details.substring(0, 80)
            })))
        }
    } catch (e) {
        console.error("Fetch FAILED:", e)
    } finally {
        await prisma.$disconnect()
    }
}

main()
