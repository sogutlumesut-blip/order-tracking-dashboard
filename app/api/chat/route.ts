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
            where.createdAt = {
                gt: new Date(Number(since))
            }
        }

        const messages = await db.chatMessage.findMany({
            where,
            take: 100, // Enforce safety query limit of 100 messages
            orderBy: { createdAt: since ? 'asc' : 'desc' },
            include: {
                sender: {
                    select: { id: true, name: true, role: true }
                }
            }
        })

        // Transform the messages to return lightweight URLs instead of raw base64 data
        const serializedMessages = messages.map(m => {
            if (m.attachment) {
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
        return NextResponse.json({ success: true, messages: resultMessages })
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
                ? `/api/chat/attachment?id=${message.id}&ext=${(message.attachment.startsWith('data:application/pdf') || (message.text && message.text.toLowerCase().endsWith('.pdf'))) ? '.pdf' : '.jpg'}`
                : null
        }

        return NextResponse.json({ success: true, message: serializedMessage })
    } catch (e: any) {
        console.error("Error sending chat message:", e)
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
