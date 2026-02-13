"use server"

import { db } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { revalidatePath } from "next/cache"
// import { logActivity } from "./actions" // Removed to avoid circular/server-action issues
// Actually logActivity is in actions.ts and might not be exported?
// Let's check actions.ts exports.
// If logActivity is not exported, I should export it or duplicate logic.
// For now, let's assume I can import it. If not, I'll see error.
// Wait, I can't import from "./actions" if actions.ts uses "use server" and I'm in another server file? Yes I can.
// But circular dependency might be an issue if actions.ts imports from here? No.

export async function bulkUpdateOrderStatus(orderIds: number[], status: string) {
    try {
        console.log(`[BulkUpdate] attempt: ${orderIds.length} orders to '${status}'`)
        const session = await getSession()
        const user = session ? session.user.name : "Sistem"

        // Bulk update
        const result = await db.order.updateMany({
            where: { id: { in: orderIds } },
            data: {
                status,
                hasNotification: true,
                assignedTo: user,
                updatedAt: new Date()
            }
        })

        console.log(`[BulkUpdate] result:`, result)

        // Log activity manually to avoid import issues
        // We use a regular loop, but we can do createMany if supported for activities?
        // SQLite/Postgres support createMany. orderActivity probably supports it.
        // Let's create activity records in bulk for performance
        if (orderIds.length > 0) {
            await db.orderActivity.createMany({
                data: orderIds.map(id => ({
                    orderId: id,
                    author: user,
                    action: "STATUS_CHANGE",
                    details: `Toplu işlem ile durum '${status}' olarak değiştirildi.`
                }))
            })
        }

        revalidatePath("/")
        return { success: true, count: result.count, message: `${result.count} sipariş güncellendi.` }
    } catch (e) {
        console.error("bulkUpdateOrderStatus ERROR:", e)
        return { success: false, error: "Toplu güncelleme hatası: " + (e as Error).message }
    }
}
