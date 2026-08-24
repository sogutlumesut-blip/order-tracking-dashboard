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
        const before = searchParams.get('before')

        const where: any = {}
        if (since) {
            const sinceDate = new Date(Number(since))
            where.updatedAt = {
                gt: sinceDate
            }
        } else if (before) {
            const beforeDate = new Date(Number(before))
            where.createdAt = {
                lt: beforeDate
            }
        }

        const selectFields = {
            id: true,
            text: true,
            senderId: true,
            hasAttachment: true,
            attachmentType: true,
            attachmentUrl: true,
            replyToId: true,
            replyToText: true,
            replyToName: true,
            reactions: true,
            isPinned: true,
            createdAt: true,
            updatedAt: true,
            sender: {
                select: { id: true, name: true, role: true }
            }
        };

        const messages = await db.chatMessage.findMany({
            where,
            orderBy: { createdAt: since ? 'asc' : 'desc' },
            take: before ? 100 : 150,
            select: selectFields
        })

        // Transform the messages to return lightweight URLs instead of raw base64 data
        const serializedMessages = messages.map(m => {
            let attachmentLink = null;
            if (m.hasAttachment) {
                if (m.attachmentType === 'url') {
                    attachmentLink = m.attachmentUrl;
                } else {
                    const ext = m.attachmentType === 'pdf' ? '.pdf' : '.jpg';
                    attachmentLink = `/api/chat/attachment?id=${m.id}&ext=${ext}`;
                }
            }
            return {
                id: m.id,
                text: m.text,
                senderId: m.senderId,
                attachment: attachmentLink,
                replyToId: m.replyToId,
                replyToText: m.replyToText,
                replyToName: m.replyToName,
                reactions: m.reactions,
                isPinned: m.isPinned,
                createdAt: m.createdAt,
                updatedAt: m.updatedAt,
                sender: m.sender
            };
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

        const hasAttach = !!attachment
        let typeAttach = null
        let urlAttach = null
        if (attachment) {
            if (attachment.startsWith('http://') || attachment.startsWith('https://')) {
                typeAttach = 'url'
                urlAttach = attachment
            } else if (attachment.startsWith('data:application/pdf')) {
                typeAttach = 'pdf'
            } else {
                typeAttach = 'image'
            }
        }

        const selectFields = {
            id: true,
            text: true,
            senderId: true,
            hasAttachment: true,
            attachmentType: true,
            attachmentUrl: true,
            replyToId: true,
            replyToText: true,
            replyToName: true,
            reactions: true,
            isPinned: true,
            createdAt: true,
            updatedAt: true,
            sender: {
                select: { id: true, name: true, role: true }
            }
        };

        const message = await db.chatMessage.create({
            data: {
                text: text.trim(),
                attachment: attachment || null,
                hasAttachment: hasAttach,
                attachmentType: typeAttach,
                attachmentUrl: urlAttach,
                replyToId: replyToId || null,
                replyToText: replyToText || null,
                replyToName: replyToName || null,
                senderId: session.user.id
            },
            select: selectFields
        })

        // Serialize the attachment URL for the newly created message
        const serializedMessage = {
            id: message.id,
            text: message.text,
            senderId: message.senderId,
            attachment: message.hasAttachment
                ? (message.attachmentType === 'url'
                    ? message.attachmentUrl
                    : `/api/chat/attachment?id=${message.id}&ext=${message.attachmentType === 'pdf' ? '.pdf' : '.jpg'}`)
                : null,
            replyToId: message.replyToId,
            replyToText: message.replyToText,
            replyToName: message.replyToName,
            reactions: message.reactions,
            isPinned: message.isPinned,
            createdAt: message.createdAt,
            updatedAt: message.updatedAt,
            sender: message.sender
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

        // Check ownership: only sender can delete their own message (or admin)
        console.log(`[DELETE_CHAT] User: ${session.user.id} (Role: ${session.user.role}) trying to delete message: ${messageId} (Sender: ${message.senderId})`)
        if (message.senderId !== session.user.id && session.user.role !== "admin") {
            return NextResponse.json({ success: false, error: "You can only delete your own messages" }, { status: 403 })
        }

        await db.chatMessage.delete({
            where: { id: messageId }
        })

        console.log(`[DELETE_CHAT] Message ${messageId} deleted successfully`)
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
        const { messageId, emoji, action } = body

        if (action === 'pin') {
            if (!messageId) {
                return NextResponse.json({ success: false, error: "Message ID is required" }, { status: 400 })
            }
            const message = await db.chatMessage.findUnique({
                where: { id: messageId }
            })
            if (!message) {
                return NextResponse.json({ success: false, error: "Message not found" }, { status: 404 })
            }
            const selectFields = {
                id: true,
                text: true,
                senderId: true,
                hasAttachment: true,
                attachmentType: true,
                attachmentUrl: true,
                replyToId: true,
                replyToText: true,
                replyToName: true,
                reactions: true,
                isPinned: true,
                createdAt: true,
                updatedAt: true,
                sender: {
                    select: { id: true, name: true, role: true }
                }
            };

            const updatedMessage = await db.chatMessage.update({
                where: { id: messageId },
                data: {
                    isPinned: !message.isPinned
                },
                select: selectFields
            })
            const serializedMessage = {
                id: updatedMessage.id,
                text: updatedMessage.text,
                senderId: updatedMessage.senderId,
                attachment: updatedMessage.hasAttachment
                    ? (updatedMessage.attachmentType === 'url'
                        ? updatedMessage.attachmentUrl
                        : `/api/chat/attachment?id=${updatedMessage.id}&ext=${updatedMessage.attachmentType === 'pdf' ? '.pdf' : '.jpg'}`)
                    : null,
                replyToId: updatedMessage.replyToId,
                replyToText: updatedMessage.replyToText,
                replyToName: updatedMessage.replyToName,
                reactions: updatedMessage.reactions,
                isPinned: updatedMessage.isPinned,
                createdAt: updatedMessage.createdAt,
                updatedAt: updatedMessage.updatedAt,
                sender: updatedMessage.sender
            }
            return NextResponse.json({ success: true, message: serializedMessage })
        }

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

        const selectFields = {
            id: true,
            text: true,
            senderId: true,
            hasAttachment: true,
            attachmentType: true,
            attachmentUrl: true,
            replyToId: true,
            replyToText: true,
            replyToName: true,
            reactions: true,
            isPinned: true,
            createdAt: true,
            updatedAt: true,
            sender: {
                select: { id: true, name: true, role: true }
            }
        };

        const updatedMessage = await db.chatMessage.update({
            where: { id: messageId },
            data: {
                reactions: JSON.stringify(reactions)
            },
            select: selectFields
        })

        // Serialize attachment for response consistency
        const serializedMessage = {
            id: updatedMessage.id,
            text: updatedMessage.text,
            senderId: updatedMessage.senderId,
            attachment: updatedMessage.hasAttachment
                ? (updatedMessage.attachmentType === 'url'
                    ? updatedMessage.attachmentUrl
                    : `/api/chat/attachment?id=${updatedMessage.id}&ext=${updatedMessage.attachmentType === 'pdf' ? '.pdf' : '.jpg'}`)
                : null,
            replyToId: updatedMessage.replyToId,
            replyToText: updatedMessage.replyToText,
            replyToName: updatedMessage.replyToName,
            reactions: updatedMessage.reactions,
            isPinned: updatedMessage.isPinned,
            createdAt: updatedMessage.createdAt,
            updatedAt: updatedMessage.updatedAt,
            sender: updatedMessage.sender
        }

        return NextResponse.json({ success: true, message: serializedMessage })
    } catch (e: any) {
        console.error("Error updating reaction:", e)
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
