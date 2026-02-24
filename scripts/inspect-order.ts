
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log("Inspecting Order #236...")
    try {
        const order = await prisma.order.findUnique({
            where: { id: 236 },
            include: { activities: true }
        })
        console.log("Order Data:", JSON.stringify(order, null, 2))
    } catch (e) {
        console.error("FAILED:", e)
    } finally {
        await prisma.$disconnect()
    }
}

main()
