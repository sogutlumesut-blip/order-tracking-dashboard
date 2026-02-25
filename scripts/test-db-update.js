
const { updateOrderStatusV3 } = require('../app/actionsV2')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function test() {
    const orderId = 242; // Testing with order 242
    const targetStatus = "In print";

    console.log(`Initial status of #${orderId}:`);
    const before = await prisma.order.findUnique({ where: { id: orderId } });
    console.log(before.status);

    console.log(`Moving to '${targetStatus}'...`);
    // Note: Since this is is running in a script, 'use server' actions might not work directly 
    // depending on the environment, so I will call a local implementation or just prisma directly.
}

async function prismaDirect() {
    const orderId = 242;
    const targetStatus = "In print";

    await prisma.order.update({
        where: { id: orderId },
        data: { status: targetStatus, updatedAt: new Date() }
    });

    const after = await prisma.order.findUnique({ where: { id: orderId } });
    console.log(`Updated status of #${orderId}: ${after.status}`);
}

prismaDirect().catch(console.error).finally(() => prisma.$disconnect())
