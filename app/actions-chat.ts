'use server'

import { db } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { unstable_noStore as noStore, revalidatePath } from "next/cache"

export async function getChatMessages(timestamp?: number) {
    noStore()
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

export async function sendChatMessage(text: string, attachment?: string) {
    const session = await getSession()
    if (!session) return { success: false, error: "Unauthorized" }
    
    if ((!text || text.trim() === "") && !attachment) return { success: false, error: "Message cannot be empty" }

    try {
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
        revalidatePath("/")
        return { success: true, message }
    } catch (e: any) {
        console.error("Error sending chat message:", e)
        return { success: false, error: e.message }
    }
}
