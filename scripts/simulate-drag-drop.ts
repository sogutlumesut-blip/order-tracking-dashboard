import { db } from "../lib/prisma"

async function main() {
    try {
        console.log("Simulating status update...");
        const orderId = 3418;
        const status = "Approved";
        const userName = "Admin User";

        const statusesList = await db.statusColumn.findMany();
        const statusMap = new Map(statusesList.map(s => [s.id, s.title]));

        console.log(`Updating #${orderId} to ${status}`);
        
        const oldOrder = await db.order.findUnique({ where: { id: Number(orderId) } });
        if (!oldOrder) {
            console.log("Order not found.");
            return;
        }
        const oldStatusTitle = oldOrder ? (statusMap.get(oldOrder.status) || oldOrder.status) : "Bilinmeyen";
        const newStatusTitle = statusMap.get(status) || status;

        console.log(`Old status title: ${oldStatusTitle}`);
        console.log(`New status title: ${newStatusTitle}`);

        const activity = await db.orderActivity.create({
            data: { 
                orderId: Number(orderId), 
                author: userName, 
                action: "STATUS_CHANGE", 
                details: `Sipariş durumu değiştirildi: '${oldStatusTitle}' -> '${newStatusTitle}'` 
            }
        });
        console.log("Created activity in DB:", JSON.stringify(activity, null, 2));

        const updated = await db.order.update({ 
            where: { id: Number(orderId) }, 
            data: { status, updatedAt: new Date(), hasNotification: true } 
        });
        console.log("Updated order in DB status:", updated.status);

    } catch (e: any) {
        console.error("Simulation failed with error:", e);
    }
}
main();
