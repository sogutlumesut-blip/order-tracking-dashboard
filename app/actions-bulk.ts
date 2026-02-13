"use server"

import { db } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { logActivity } from "./actions" // Import from main actions file or move logActivity to utils?
// Actually logActivity is in actions.ts and might not be exported?
// Let's check actions.ts exports.
// If logActivity is not exported, I should export it or duplicate logic.
// For now, let's assume I can import it. If not, I'll see error.
// Wait, I can't import from "./actions" if actions.ts uses "use server" and I'm in another server file? Yes I can.
// But circular dependency might be an issue if actions.ts imports from here? No.

export async function bulkUpdateOrderStatus(orderIds: number[], status: string) {
    try {
        const session = await getSession()
        const user = session ? session.user.name : "Sistem"

        // Bulk update
        await db.order.updateMany({
            where: { id: { in: orderIds } },
            data: {
                status,
                hasNotification: true,
                assignedTo: user,
                updatedAt: new Date()
            }
        })

        // Log legacy activity (one by one or bulk? One by one is safer for history)
        // For performance, maybe just one log? No, history needs granularity.
        // Let's do a loop for logs
        for (const id of orderIds) {
            await logActivity(id, user, "STATUS_CHANGE", `Toplu işlem ile durum '${status}' olarak değiştirildi.`)
        }

        revalidatePath("/")
        return { success: true, message: `${orderIds.length} sipariş güncellendi.` }
    } catch (e) {
        console.error("bulkUpdateOrderStatus ERROR:", e)
        return { error: "Toplu güncelleme hatası." }
    }
}
