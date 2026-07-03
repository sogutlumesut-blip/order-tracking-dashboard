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

            // Determine safe filename based on Content-Type
            let filename = "gorsel.jpg"
            if (contentType === "application/pdf") {
                filename = "belge.pdf"
            } else if (contentType === "image/png") {
                filename = "gorsel.png"
            } else if (contentType === "image/gif") {
                filename = "gorsel.gif"
            } else if (contentType === "image/webp") {
                filename = "gorsel.webp"
            }

            return new Response(buffer, {
                headers: {
                    "Content-Type": contentType,
                    "Content-Disposition": `inline; filename="${filename}"`,
                    "Cache-Control": "public, max-age=31536000, immutable" // Highly cacheable in client browsers
                }
            })
        }

        // Fallback: if it's a URL, redirect to it!
        if (message.attachment.startsWith('http://') || message.attachment.startsWith('https://')) {
            return Response.redirect(message.attachment, 307)
        }

        // Fallback in case the stored attachment is not a data URI
        return new Response(message.attachment)
    } catch (e: any) {
        console.error("Error serving attachment:", e)
        return new Response(e.message || "Internal Server Error", { status: 500 })
    }
}
