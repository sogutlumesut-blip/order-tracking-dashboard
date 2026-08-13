import { db } from "./prisma";

export async function autoCompleteOldOrders() {
    try {
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        const shippedOrders = await db.order.findMany({
            where: {
                status: 'shipped'
            },
            include: {
                activities: {
                    where: {
                        action: 'STATUS_CHANGE'
                    },
                    orderBy: {
                        timestamp: 'desc'
                    }
                }
            }
        });

        const ordersToComplete = shippedOrders.filter(order => {
            const shippedActivity = order.activities.find((act: any) => {
                const detailsLower = (act.details || "").toLowerCase();
                return detailsLower.includes('kargolandı') || 
                       detailsLower.includes('kargolandi') || 
                       detailsLower.includes("-> 'shipped'") || 
                       detailsLower.includes("olarak 'shipped'") ||
                       detailsLower.includes("durum 'shipped'");
            });

            if (shippedActivity) {
                return new Date(shippedActivity.timestamp) < threeDaysAgo;
            }

            return new Date(order.updatedAt) < threeDaysAgo;
        });

        if (ordersToComplete.length > 0) {
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
                        details: 'Sipariş Kargolandı kolonunda 3 günü doldurduğu için otomatik olarak Tamamlandı yapıldı.'
                    }
                })
            );

            await db.$transaction([...updates, ...activities]);
            return { success: true, count: ordersToComplete.length };
        }

        return { success: true, count: 0 };
    } catch (e: any) {
        console.error("Error in autoCompleteOldOrders:", e);
        return { error: e.message };
    }
}
