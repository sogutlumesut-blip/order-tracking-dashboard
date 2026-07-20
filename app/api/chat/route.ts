import { NextResponse } from "next/server"
import { db } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

export async function GET(req: Request) {
    const session = await getSession()
    if (!session) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    try {
        const { searchParams } = new URL(req.url)
        const since = searchParams.get('since')

        const where: any = {}
        if (since) {
            const sinceDate = new Date(Number(since))
            where.OR = [
                { createdAt: { gt: sinceDate } },
                { updatedAt: { gt: sinceDate } }
            ]
        }

        const messages = await db.chatMessage.findMany({
            where,
            orderBy: { createdAt: since ? 'asc' : 'desc' },
            take: 150,
            include: {
                sender: {
                    select: { id: true, name: true, role: true }
                }
            }
        })

        // Transform the messages to return lightweight URLs instead of raw base64 data
        const serializedMessages = messages.map(m => {
            if (m.attachment) {
                if (m.attachment.startsWith('http://') || m.attachment.startsWith('https://')) {
                    return m
                }
                const isPdf = m.attachment.startsWith('data:application/pdf') || (m.text && m.text.toLowerCase().endsWith('.pdf'))
                const ext = isPdf ? '.pdf' : '.jpg'
                return {
                    ...m,
                    attachment: `/api/chat/attachment?id=${m.id}&ext=${ext}`
                }
            }
            return m
        })
        
        // If we fetched using 'since', the order is already 'asc' (chronological).
        // Otherwise, it was 'desc' and we need to reverse it to display oldest first.
        const resultMessages = since ? serializedMessages : serializedMessages.reverse()
        const response = NextResponse.json({ success: true, messages: resultMessages })
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
        response.headers.set('Pragma', 'no-cache')
        response.headers.set('Expires', '0')
        return response
    } catch (e: any) {
        console.error("Error fetching chat messages:", e)
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}

export async function POST(req: Request) {
    const session = await getSession()
    if (!session) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const { text, attachment, replyToId, replyToText, replyToName } = body

        if ((!text || text.trim() === "") && !attachment) {
            return NextResponse.json({ success: false, error: "Message cannot be empty" }, { status: 400 })
        }

        const message = await db.chatMessage.create({
            data: {
                text: text.trim(),
                attachment: attachment || null,
                replyToId: replyToId || null,
                replyToText: replyToText || null,
                replyToName: replyToName || null,
                senderId: session.user.id
            },
            include: {
                sender: {
                    select: { id: true, name: true, role: true }
                }
            }
        })

        // Serialize the attachment URL for the newly created message
        const serializedMessage = {
            ...message,
            attachment: message.attachment 
                ? (message.attachment.startsWith('http://') || message.attachment.startsWith('https://')
                    ? message.attachment
                    : `/api/chat/attachment?id=${message.id}&ext=${(message.attachment.startsWith('data:application/pdf') || (message.text && message.text.toLowerCase().endsWith('.pdf'))) ? '.pdf' : '.jpg'}`)
                : null
        }

        return NextResponse.json({ success: true, message: serializedMessage })
    } catch (e: any) {
        console.error("Error sending chat message:", e)
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}

export async function DELETE(req: Request) {
    const session = await getSession()
    if (!session) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    try {
        const { searchParams } = new URL(req.url)
        const messageId = searchParams.get('messageId')
        if (!messageId) {
            return NextResponse.json({ success: false, error: "Message ID is required" }, { status: 400 })
        }

        const message = await db.chatMessage.findUnique({
            where: { id: messageId }
        })

        if (!message) {
            return NextResponse.json({ success: false, error: "Message not found" }, { status: 404 })
        }

        // Check ownership: only sender can delete their own message
        if (message.senderId !== session.user.id) {
            return NextResponse.json({ success: false, error: "You can only delete your own messages" }, { status: 403 })
        }

        await db.chatMessage.delete({
            where: { id: messageId }
        })

        return NextResponse.json({ success: true })
    } catch (e: any) {
        console.error("Error deleting chat message:", e)
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}

export async function PUT(req: Request) {
    const session = await getSession()
    if (!session) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const { messageId, emoji } = body

        if (!messageId || !emoji) {
            return NextResponse.json({ success: false, error: "Message ID and emoji are required" }, { status: 400 })
        }

        const message = await db.chatMessage.findUnique({
            where: { id: messageId }
        })

        if (!message) {
            return NextResponse.json({ success: false, error: "Message not found" }, { status: 404 })
        }

        let reactions: any[] = []
        if (message.reactions) {
            try {
                reactions = JSON.parse(message.reactions)
            } catch (e) {
                reactions = []
            }
        }

        const existingIndex = reactions.findIndex((r: any) => r.userId === session.user.id)
        if (existingIndex > -1) {
            const existing = reactions[existingIndex]
            if (existing.emoji === emoji) {
                // Toggle off: remove reaction
                reactions.splice(existingIndex, 1)
            } else {
                // Update to new emoji
                reactions[existingIndex].emoji = emoji
            }
        } else {
            // Add new reaction
            reactions.push({
                emoji,
                userId: session.user.id,
                userName: session.user.name
            })
        }

        const updatedMessage = await db.chatMessage.update({
            where: { id: messageId },
            data: {
                reactions: JSON.stringify(reactions)
            },
            include: {
                sender: {
                    select: { id: true, name: true, role: true }
                }
            }
        })

        // Serialize attachment for response consistency
        const serializedMessage = {
            ...updatedMessage,
            attachment: updatedMessage.attachment 
                ? (updatedMessage.attachment.startsWith('http://') || updatedMessage.attachment.startsWith('https://')
                    ? updatedMessage.attachment
                    : `/api/chat/attachment?id=${updatedMessage.id}&ext=${(updatedMessage.attachment.startsWith('data:application/pdf') || (updatedMessage.text && updatedMessage.text.toLowerCase().endsWith('.pdf'))) ? '.pdf' : '.jpg'}`)
                : null
        }

        return NextResponse.json({ success: true, message: serializedMessage })
    } catch (e: any) {
        console.error("Error updating reaction:", e)
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
