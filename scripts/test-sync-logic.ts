
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function testSyncLogic() {
    const orderId = 229;
    const defaultStatus = 'pending';
    const localStatus = 'draft';

    console.log(`--- Testing Sync Logic for Order #${orderId} ---`);

    // 1. Prepare Order: Set status to 'draft' (non-default)
    console.log(`Setting order status to '${localStatus}'...`);
    await prisma.order.update({
        where: { id: orderId },
        data: {
            status: localStatus,
            updatedAt: new Date()
        }
    });

    // 2. Simulate Sync Logic
    console.log("Simulating WooCommerce sync logic...");
    const existingOrder = await prisma.order.findUnique({
        where: { id: orderId }
    });

    if (!existingOrder) throw new Error("Order not found");

    // This is the status we got from WooCommerce (mapped)
    const wcMappedStatus = 'pending'; // WC says it's still processing/pending

    // Logic from actions.ts:
    const normStatus = wcMappedStatus.trim();
    const normLocalStatus = existingOrder.status.trim();
    const normDefaultStatus = defaultStatus.trim();

    const keepLocalStatus = (normStatus === normDefaultStatus && normLocalStatus !== normDefaultStatus);

    let finalStatus = wcMappedStatus;
    if (keepLocalStatus) {
        finalStatus = existingOrder.status;
        console.log("SUCCESS: Logic correctly identified that we should KEEP local status.");
    } else {
        console.log("FAILURE: Logic would have overwritten the local status!");
    }

    console.log(`Final Status to be saved: ${finalStatus}`);

    if (finalStatus === localStatus) {
        console.log("TEST PASSED: Status correctly preserved.");
    } else {
        console.log("TEST FAILED: Status would be reverted.");
    }
}

testSyncLogic()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
