import { addCommentAction } from '../app/actions'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function test() {
    const orderId = 352
    const message = "SIMULATION TEST - " + new Date().toISOString()
    const authorId = "7638d541-c994-4f8c-bec2-d02c763b368b" // Yeşim Satış

    console.log(`Testing addCommentAction for Order #${orderId} as User ${authorId}...`)

    // Note: addCommentAction uses getSession() which relies on cookies().
    // We can't easily call it from a script if it uses cookies().
    // However, we can inspect the code to see what it does.

    try {
        // Direct DB attempt to see if it works
        const comment = await db.comment.create({
            data: {
                message: message,
                orderId: orderId,
                authorId: authorId,
                type: "message",
                attachments: "[]"
            }
        })
        console.log("Direct DB Insert SUCCESS:", comment.id)

        await db.comment.delete({ where: { id: comment.id } })
        console.log("Cleaned up test comment.")

    } catch (e: any) {
        console.error("Direct DB Insert FAILED:", e)
    } finally {
        await db.$disconnect()
    }
}

test()
