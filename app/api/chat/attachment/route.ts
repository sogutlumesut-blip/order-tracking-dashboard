import { NextResponse } from "next/server"
import { db } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

export async function GET(req: Request) {
    const session = await getSession()
    if (!session) {
        return new Response("Unauthorized", { status: 401 })
    }

    try {
        const { searchParams } = new URL(req.url)
        const id = searchParams.get('id')

        if (!id) {
            return new Response("Bad Request", { status: 400 })
        }

        const message = await db.chatMessage.findUnique({
            where: { id },
            select: { attachment: true }
        })

        if (!message || !message.attachment) {
            return new Response("Not Found", { status: 404 })
        }

        // Check if it is a base64 encoded data URI
        const match = message.attachment.match(/^data:([^;]+);base64,(.+)$/)
        if (match) {
            const contentType = match[1]
            const base64Data = match[2]
            const buffer = Buffer.from(base64Data, 'base64')
            return new Response(buffer, {
                headers: {
                    "Content-Type": contentType,
                    "Cache-Control": "public, max-age=31536000, immutable" // Highly cacheable in client browsers
                }
            })
        }

        // Fallback in case the stored attachment is not a data URI
        return new Response(message.attachment)
    } catch (e: any) {
        console.error("Error serving attachment:", e)
        return new Response(e.message || "Internal Server Error", { status: 500 })
    }
}
