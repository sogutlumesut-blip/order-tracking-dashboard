import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    try {
        const orderId = 290;
        console.log(`Checking comments for Order #${orderId}...`);
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                comments: {
                    include: { author: { select: { name: true, role: true } } },
                    orderBy: { timestamp: 'asc' }
                }
            }
        });

        if (!order) {
            console.log("Order not found.");
            return;
        }

        console.log(`Order Internal ID: ${order.id}, External ID: ${order.externalId}, Source: ${order.source}`);
        console.log(`Comments Count: ${order.comments.length}`);

        const simplifiedComments = order.comments.map(c => ({
            id: c.id,
            author: c.author?.name,
            role: c.author?.role,
            message: c.message,
            type: c.type,
            timestamp: c.timestamp,
            hasAttachments: !!c.attachments && c.attachments !== '[]'
        }));

        console.table(simplifiedComments);

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
