
import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export const dynamic = 'force-dynamic'; // Ensure it's not cached

export async function GET(req: Request) {
    try {
        // Authenticate the cron request? 
        // For simplicity in this context, we'll allow it or check a header if needed.
        // But since this is specific to user request "2-3 gün sonra otomatik tamamlandı", we make it a simple endpoint.

        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        const ordersToComplete = await db.order.findMany({
            where: {
                status: 'shipped',
                updatedAt: {
                    lt: threeDaysAgo
                }
            }
        });

        if (ordersToComplete.length === 0) {
            return NextResponse.json({ message: "No orders to auto-complete." });
        }

        const updates = ordersToComplete.map(order =>
            db.order.update({
                where: { id: order.id },
                data: {
                    status: 'completed',
                    updatedAt: new Date()
                }
            })
        );

        const activities = ordersToComplete.map(order =>
            db.orderActivity.create({
                data: {
                    orderId: order.id,
                    author: 'Sistem (Oto)',
                    action: 'AUTO_COMPLETE',
                    details: 'Sipariş kargolandıktan 3 gün sonra otomatik tamamlandı.'
                }
            })
        );

        // revalidatePath("/"); // Commented out to prevent query bottlenecks during cron runs
        return NextResponse.json({
            success: true,
            message: `${ordersToComplete.length} orders auto-completed.`,
            ids: ordersToComplete.map(o => o.id)
        });

    } catch (e: any) {
        console.error("Auto-Complete Cron Error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
