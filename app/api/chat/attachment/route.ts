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

            // Determine accurate extension based on Content-Type
            let extension = "jpg"
            if (contentType === "application/pdf") {
                extension = "pdf"
            } else if (contentType === "image/png") {
                extension = "png"
            } else if (contentType === "image/gif") {
                extension = "gif"
            } else if (contentType === "image/webp") {
                extension = "webp"
            } else if (contentType === "image/svg+xml") {
                extension = "svg"
            }

            const isDownload = searchParams.get('download') === '1'
            const customName = searchParams.get('name')
            const filename = customName
                ? (customName.includes('.') ? customName : `${customName}.${extension}`)
                : `gorsel-${id.substring(0, 8)}.${extension}`

            return new Response(buffer, {
                headers: {
                    "Content-Type": contentType,
                    "Content-Disposition": `${isDownload ? 'attachment' : 'inline'}; filename="${filename}"`,
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
