
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log("Checking for v3.6.6.8 diagnostic logs...")
    try {
        const activities = await prisma.orderActivity.findMany({
            where: {
                details: { contains: 'v3.6.6.8' }
            },
            orderBy: { timestamp: 'desc' },
            take: 50
        })

        if (activities.length === 0) {
            console.log("No v3.6.6.8 logs found. This indicates server actions are failing before the first log or aren't being called.")
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
