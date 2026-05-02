import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function run() {
    console.log("Fixing order sources and column sorting...");

    // 1. Move PrintMarkt orders to pending_pm
    const pmMigrate = await db.order.updateMany({
        where: { status: "pending_woo", source: "PrintMarkt" },
        data: { status: "pending_pm" }
    });
    console.log(`Migrated ${pmMigrate.count} PrintMarkt orders correctly.`);

    // 2. Re-order status columns
    const statuses = await db.statusColumn.findMany();
    
    const targetOrder: Record<string, number> = {
        "pending_woo": 0,
        "pending_pm": 1,
        "draft": 2,
        "Awaiting Approval": 3,
        "Approved": 4,
        "In print": 5,
        "Ready/Packaged": 6,
        "shipped": 7,
        "completed": 8,
        "cancelled": 9
    };

    for (const status of statuses) {
        if (targetOrder[status.id] !== undefined) {
            await db.statusColumn.update({
                where: { id: status.id },
                data: { order: targetOrder[status.id] }
            });
            console.log(`Set order ${targetOrder[status.id]} for ${status.id}`);
        }
    }

    console.log("Fix complete.");
    await db.$disconnect();
}
run();
