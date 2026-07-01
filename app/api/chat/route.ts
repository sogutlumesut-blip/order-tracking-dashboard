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
            take: since ? undefined : 100,
            orderBy: { createdAt: since ? 'asc' : 'desc' },
            include: {
                sender: {
                    select: { id: true, name: true, role: true }
                }
            }
        })
        
        // If we fetched using 'since', the order is already 'asc' (chronological).
        // Otherwise, it was 'desc' and we need to reverse it to display oldest first.
        const resultMessages = since ? messages : messages.reverse()
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

        return NextResponse.json({ success: true, message })
    } catch (e: any) {
        console.error("Error sending chat message:", e)
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
