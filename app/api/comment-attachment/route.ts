import { db } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
    const session = await getSession()
    if (!session) {
        return new Response("Unauthorized", { status: 401 })
    }

    try {
        const { searchParams } = new URL(req.url)
        const commentId = searchParams.get('commentId')
        const index = parseInt(searchParams.get('index') || '0', 10)

        if (!commentId) {
            return new Response("Bad Request: commentId missing", { status: 400 })
        }

        const comment = await db.comment.findUnique({
            where: { id: commentId },
            select: { attachments: true }
        })

        if (!comment || !comment.attachments) {
            return new Response("Not Found", { status: 404 })
        }

        let attachments: any[] = []
        try {
            const raw = JSON.parse(comment.attachments as string)
            attachments = Array.isArray(raw) ? raw : [raw]
        } catch {
            return new Response("Invalid attachments format", { status: 500 })
        }

        const att = attachments[index]
        if (!att || !att.url) {
            return new Response("Attachment Not Found", { status: 404 })
        }

        // If it's a base64 data URI, stream the binary buffer with cache headers
        const match = att.url.match(/^data:([^;]+);base64,(.+)$/)
        if (match) {
            const contentType = match[1]
            const base64Data = match[2]
            const buffer = Buffer.from(base64Data, 'base64')

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
            const customName = searchParams.get('name') || att.name
            const filename = customName
                ? (customName.includes('.') ? customName : `${customName}.${extension}`)
                : `ek-${commentId.substring(0, 8)}.${extension}`

            return new Response(buffer, {
                headers: {
                    "Content-Type": contentType,
                    "Content-Disposition": `${isDownload ? 'attachment' : 'inline'}; filename="${encodeURIComponent(filename)}"`,
                    "Cache-Control": "public, max-age=31536000, immutable"
                }
            })
        }

        // Fallback: If it's already an HTTP / HTTPS URL, redirect to it
        if (att.url.startsWith('http://') || att.url.startsWith('https://')) {
            return Response.redirect(att.url, 307)
        }

        return new Response(att.url)
    } catch (e: any) {
        console.error("Error serving comment attachment:", e)
        return new Response(e.message || "Internal Server Error", { status: 500 })
    }
}
