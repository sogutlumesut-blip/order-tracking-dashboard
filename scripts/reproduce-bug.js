
const { PrismaClient } = require('@prisma/client')
const { updateOrderStatusV3 } = require('../app/actionsV2')
const { syncWooCommerceOrders } = require('../app/actions')

const prisma = new PrismaClient()

async function reproduce() {
    const orderId = 242;
    const barcode = "WC-107322";

    console.log("--- START REPRODUCTION ---");

    // 1. Reset to 'pending'
    console.log("Setting to 'pending'...");
    await prisma.order.update({
        where: { id: orderId },
        data: { status: 'pending', updatedAt: new Date() }
    });

    // 2. Simulate Manual Move to 'draft'
    console.log("Calling updateOrderStatusV3 to move to 'draft'...");
    const moveRes = await updateOrderStatusV3(orderId, 'draft');
    console.log("Move Response:", moveRes);

    const midStatus = await prisma.order.findUnique({ where: { id: orderId } });
    console.log("Status after V3 update:", midStatus.status);

    if (midStatus.status !== 'draft') {
        throw new Error("V3 update failed to persist status!");
    }

    // 3. Simulate Sync
    console.log("Triggering forced sync...");
    // Mocking the WC response in our mind - we know it will return 'processing' for this order
    // which maps to 'pending' in our code.
    const syncRes = await syncWooCommerceOrders(true);
    console.log("Sync Response:", syncRes.message);

    // 4. Final Check
    const finalStatus = await prisma.order.findUnique({ where: { id: orderId } });
    console.log("Final Status in DB:", finalStatus.status);

    if (finalStatus.status === 'pending') {
        console.log("FAILURE: REVERSION DETECTED!");
    } else {
        console.log("SUCCESS: PERSISTENCE MAINTAINED.");
    }
}

reproduce().catch(err => {
    console.error("Reproduction Error:", err);
    process.exit(1);
}).finally(() => prisma.$disconnect());
