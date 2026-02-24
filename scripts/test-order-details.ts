
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function testUpdateDetails() {
    const orderId = 229;
    console.log(`--- Testing updateOrderDetails for Order #${orderId} ---`);

    const oldOrder = await prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true }
    });

    if (!oldOrder) throw new Error("Order not found");

    console.log("Current Status:", oldOrder.status);

    // Simulate the update with 'draft'
    console.log("Attempting to update status to 'draft'...");

    try {
        const result = await prisma.order.update({
            where: { id: orderId },
            data: {
                status: 'draft',
                updatedAt: new Date(),
                // Simulate item recreate logic
                items: {
                    deleteMany: {},
                    create: oldOrder.items.map((item: any) => ({
                        name: item.name,
                        quantity: item.quantity,
                        image_src: item.image_src,
                        sku: item.sku,
                        url: item.url,
                        material: item.material,
                        dimensions: item.dimensions,
                        productNote: item.productNote,
                        sampleData: item.sampleData
                    }))
                }
            }
        });

        console.log("Update SUCCESSFUL. New Status:", result.status);
    } catch (e: any) {
        console.error("Update FAILED:", e);
    }

    const check = await prisma.order.findUnique({ where: { id: orderId } });
    console.log("Final check in DB:", check?.status);
}

testUpdateDetails()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
