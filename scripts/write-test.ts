
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log("Testing write access...")
    try {
        const activity = await prisma.orderActivity.create({
            data: {
                orderId: 229,
                author: "Debug Script",
                action: "WRITE_TEST",
                details: "Testing write access at " + new Date().toISOString()
            }
        })
        console.log("Write SUCCESSFUL. Activity ID:", activity.id)
    } catch (e) {
        console.error("Write FAILED:", e)
    } finally {
        await prisma.$disconnect()
    }
}

main()
