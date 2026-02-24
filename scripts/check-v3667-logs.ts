
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log("Checking for v3.6.6.7 diagnostic logs...")
    try {
        const activities = await prisma.orderActivity.findMany({
            where: {
                details: { contains: 'v3.6.6.7' }
            },
            orderBy: { timestamp: 'desc' },
            take: 50
        })

        if (activities.length === 0) {
            console.log("No v3.6.6.7 logs found in OrderActivity table.")
            // Try to check console logs via a more recent catch-all?
            // Actually, if ACTION_START is logged as a console.log, I can't see it here.
            // But I did also add it to OrderActivity in some places (DEBUG_END).
        } else {
            console.table(activities.map(a => ({
                id: a.id,
                time: a.timestamp.toISOString(),
                orderId: a.orderId,
                action: a.action,
                details: a.details.substring(0, 100)
            })))
        }
    } catch (e) {
        console.error("Fetch FAILED:", e)
    } finally {
        await prisma.$disconnect()
    }
}

main()
