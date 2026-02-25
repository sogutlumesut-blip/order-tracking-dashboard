
"use server"

import { db } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import { revalidatePath } from "next/cache"

export async function updateOrderStatusV3(rawOrderId: any, status: string) {
    const v = "v3.6.6.12"
    console.log(`[V3_START] #${rawOrderId} -> ${status} (${v})`);

    try {
        const orderId = Number(rawOrderId)
        if (isNaN(orderId)) throw new Error("Invalid Order ID")

        const session = await getSession()
        const user = session?.user?.name || "Sistem"

        // ABSOLUTE FIRST STEP: DB Log
        await db.orderActivity.create({
            data: {
                orderId,
                author: user,
                action: "V3_RAW_START",
                details: `V3 Call: ID=${orderId}, Status=${status}, Version=${v}`
            }
        }).catch(e => console.error("V3 LOG FAIL:", e))

        // RAW SQL BACKUP (Ultra Robust)
        try {
            await db.$executeRawUnsafe(
                `UPDATE "Order" SET status = $1, "updatedAt" = NOW(), "hasNotification" = true WHERE id = $2`,
                status, orderId
            );
            console.log(`[V3_RAW_SQL] Success for #${orderId}`);
        } catch (rawError: any) {
            console.error("V3 RAW SQL FAIL:", rawError);
        }

        // PRISMA UPDATE (Standard)
        const updateResult = await db.order.update({
            where: { id: orderId },
            data: {
                status,
                hasNotification: true,
                updatedAt: new Date()
            }
        });

        console.log(`[V3_PRISMA_DONE] Order #${orderId} moved to ${updateResult.status}`);

        await db.orderActivity.create({
            data: {
                orderId,
                author: user,
                action: "V3_SUCCESS",
                details: `Successfully moved to ${status} (${v})`
            }
        }).catch(() => { });

        revalidatePath("/")
        return { success: true, version: v, newStatus: updateResult.status }

    } catch (e: any) {
        console.error("V3 CRITICAL ERROR:", e);
        return { error: e.message || "Bilinmeyen hata (v3.6.6.12)" }
    }
}
