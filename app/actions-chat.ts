'use server'

import { db } from "@/lib/prisma"
import { getSession } from "@/lib/auth"

export async function getChatMessages() {
    const session = await getSession()
    if (!session) return { success: false, error: "Unauthorized" }

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
        return { success: true, messages: messages.reverse() }
    } catch (e: any) {
        console.error("Error fetching chat messages:", e)
        return { success: false, error: e.message }
    }
}

export async function sendChatMessage(text: string) {
    const session = await getSession()
    if (!session) return { success: false, error: "Unauthorized" }
    
    if (!text || text.trim() === "") return { success: false, error: "Message cannot be empty" }

    try {
        const message = await db.chatMessage.create({
            data: {
                text: text.trim(),
                senderId: session.user.id
            },
            include: {
                sender: {
                    select: { id: true, name: true, role: true }
                }
            }
        })
        return { success: true, message }
    } catch (e: any) {
        console.error("Error sending chat message:", e)
        return { success: false, error: e.message }
    }
}
