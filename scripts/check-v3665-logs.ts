
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log("Searching for ANY v3.6.6.5 debug logs (action contains DEBUG)...")
    try {
        const activities = await prisma.orderActivity.findMany({
            where: {
                action: {
                    contains: 'DEBUG'
                }
            },
            orderBy: { timestamp: 'desc' },
            take: 20
        })

        console.table(activities.map(a => ({
            time: a.timestamp.toISOString(),
            orderId: a.orderId,
            action: a.action,
            details: a.details.substring(0, 50)
        })))
    } catch (e) {
        console.error("FAILED:", e)
    } finally {
        await prisma.$disconnect()
    }
}

main()
