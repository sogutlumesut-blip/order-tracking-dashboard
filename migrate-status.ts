import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function run() {
    console.log("Starting migration...");

    try {
        // 1. Create new status columns if they don't exist
        const newStatuses = [
            { id: "pending_woo", title: "Bekliyor (DKM)", color: "#64748b", order: 0 },
            { id: "pending_pm", title: "Bekliyor (PrintMarkt)", color: "#64748b", order: 1 }
        ];

        for (const s of newStatuses) {
            await db.statusColumn.upsert({
                where: { id: s.id },
                create: s,
                update: s
            });
        }
        console.log("Created pending_woo and pending_pm statuses.");

        // 2. Migrate existing orders
        const printMarktMigrate = await db.order.updateMany({
            where: { status: "pending", source: "printmarkt" },
            data: { status: "pending_pm" }
        });
        console.log(`Migrated ${printMarktMigrate.count} PrintMarkt orders.`);

        const wooMigrate = await db.order.updateMany({
            where: { status: "pending" }, // Catch all remaining (woo, null, etc.)
            data: { status: "pending_woo" }
        });
        console.log(`Migrated ${wooMigrate.count} WooCommerce/Manual orders.`);

        // 3. Migrate user permissions
        const users = await db.user.findMany();
        for (const user of users) {
            if (user.allowedStatuses) {
                let parsed = [];
                try {
                    parsed = JSON.parse(user.allowedStatuses);
                    if (Array.isArray(parsed) && parsed.includes("pending")) {
                        const newAllowed = parsed.filter(s => s !== "pending");
                        newAllowed.push("pending_woo", "pending_pm");
                        await db.user.update({
                            where: { id: user.id },
                            data: { allowedStatuses: JSON.stringify(newAllowed) }
                        });
                        console.log(`Updated permissions for user: ${user.id}`);
                    }
                } catch (e) {
                    console.error("Failed to parse allowedStatuses for user", user.id);
                }
            }
        }

        // 4. Delete the old "pending" status column
        try {
            await db.statusColumn.delete({
                where: { id: "pending" }
            });
            console.log("Deleted old 'pending' status.");
        } catch (e) {
            console.log("Could not delete 'pending' status (it might not exist or is still referenced).");
        }

        console.log("Migration complete!");
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        await db.$disconnect();
    }
}

run();
