import { NextResponse } from "next/server"
import { db } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

export async function GET() {
    const session = await getSession()
    if (!session) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    try {
        const messages = await db.chatMessage.findMany({
            take: 100,
            orderBy: { createdAt: 'desc' },
            include: {
                sender: {
                    select: { id: true, name: true, role: true }
                }
            }
        })
        return NextResponse.json({ success: true, messages: messages.reverse() })
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
        const { text, attachment } = body

        if ((!text || text.trim() === "") && !attachment) {
            return NextResponse.json({ success: false, error: "Message cannot be empty" }, { status: 400 })
        }

        const message = await db.chatMessage.create({
            data: {
                text: text.trim(),
                attachment: attachment || null,
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
