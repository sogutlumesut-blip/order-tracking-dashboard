
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function trace(orderId, targetStatus) {
    console.log(`--- Tracing Status Update for #${orderId} to '${targetStatus}' ---`);

    // 1. Current State
    const before = await prisma.order.findUnique({
        where: { id: orderId },
        include: { activities: { take: 1, orderBy: { timestamp: 'desc' } } }
    });
    console.log(`Current Status: ${before.status}`);
    console.log(`Last Activity: ${before.activities[0]?.details || 'None'}`);

    // 2. Perform Update (Simulating actionsV2.ts logic)
    console.log(`Performing update...`);
    const updateResult = await prisma.order.update({
        where: { id: orderId },
        data: {
            status: targetStatus,
            hasNotification: true,
            updatedAt: new Date()
        }
    });
    console.log(`Prisma Update Result Status: ${updateResult.status}`);

    // 3. Create Activity
    await prisma.orderActivity.create({
        data: {
            orderId,
            author: "Trace Script",
            action: "V3_SUCCESS",
            details: `Successfully moved to ${targetStatus} (TRACE)`
        }
    });

    // 4. Verification
    const after = await prisma.order.findUnique({
        where: { id: orderId },
        include: { activities: { take: 1, orderBy: { timestamp: 'desc' } } }
    });
    console.log(`Final Status in DB: ${after.status}`);
    console.log(`Newest Activity: ${after.activities[0]?.details}`);

    if (after.status === targetStatus) {
        console.log("SUCCESS: Database update stuck.");
    } else {
        console.log("FAILURE: Database update did not stick?!");
    }
}

trace(242, "In print").catch(console.error).finally(() => prisma.$disconnect())
