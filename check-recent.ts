import { db } from "./lib/prisma";

async function run() {
    const logs = await db.activityLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        where: { action: { in: ['CARGO_START', 'CARGO_SUCCESS', 'MNG_API_RES', 'MNG_BARKOD_RES'] } }
    });
    console.log("Recent Logs:", logs);
}

run().catch(console.error);
