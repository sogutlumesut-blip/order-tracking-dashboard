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
    const start = Date.now()
    try {
        console.log(`[Bulk-v1.4] Start: ${orderIds.length} -> ${status}`)
        const session = await getSession()
        const user = session ? session.user.name : "Sistem"

        // 1. Just Update - No Transactions, No Logging, No Side Effects
        const result = await db.order.updateMany({
            where: { id: { in: orderIds } },
            data: {
                status,
                hasNotification: true,
                assignedTo: user,
                updatedAt: new Date()
            }
        })

        // 2. Skip Manual Logging for now (Isolate cause)

        // 3. Skip RevalidatePath (Let Client handle it via router.refresh())
        // revalidatePath("/") 

        const end = Date.now()
        const duration = end - start

        const debugMsg = `v1.4-LITE: ${result.count} Updated in ${duration}ms`
        console.log(debugMsg)

        return { success: true, count: result.count, message: debugMsg }
    } catch (e) {
        console.error("bulkUpdateOrderStatus ERROR:", e)
        return { success: false, error: "ERR: " + (e as Error).message }
    }
}
