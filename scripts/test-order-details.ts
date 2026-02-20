import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function getOrderDetailsTest(orderId: number) {
    console.log(`--- Testing getOrderDetails for #${orderId} ---`)
    try {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                comments: {
                    include: { author: true },
                    orderBy: { timestamp: "asc" }
                },
                activities: {
                    orderBy: { timestamp: "desc" }
                }
            }
        })

        if (!order) {
            console.log("Order not found.")
            return
        }

        console.log(`Found ${order.comments.length} comments and ${order.activities.length} activities.`)

        // Test mapping
        const mapped = {
            comments: order.comments.map(c => ({
                id: c.id,
                message: c.message,
                timestamp: c.timestamp.toISOString(),
                author: c.author?.name || "Unknown"
            }))
        }
        console.log("Mapped first comment:", mapped.comments[0])

    } catch (e) {
        console.error("Test Error:", e)
    } finally {
        await prisma.$disconnect()
    }
}

getOrderDetailsTest(171)
