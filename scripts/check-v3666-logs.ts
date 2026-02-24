
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log("Checking for v3.6.6.6 diagnostic logs...")
    try {
        const activities = await prisma.orderActivity.findMany({
            where: {
                OR: [
                    { action: { contains: 'RAW' } },
                    { action: { contains: 'DEBUG' } }
                ]
            },
            orderBy: { timestamp: 'desc' },
            take: 20
        })

        if (activities.length === 0) {
            console.log("No diagnostic logs found since deployment.")
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
