
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    console.log(`Counting activities since ${today.toISOString()}...`)
    try {
        const count = await prisma.orderActivity.count({
            where: {
                timestamp: {
                    gte: today
                }
            }
        })
        console.log("Total activities today:", count)

        if (count > 0) {
            const latest = await prisma.orderActivity.findMany({
                where: { timestamp: { gte: today } },
                orderBy: { timestamp: 'desc' },
                take: 10
            })
            console.table(latest.map(a => ({
                id: a.id,
                orderId: a.orderId,
                action: a.action,
                details: a.details.substring(0, 50)
            })))
        }
    } catch (e) {
        console.error("FAILED:", e)
    } finally {
        await prisma.$disconnect()
    }
}

main()
