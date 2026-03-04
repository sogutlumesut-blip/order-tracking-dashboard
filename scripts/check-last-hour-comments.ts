import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    try {
        console.log("Checking for ANY comments created in the LAST HOUR...");
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

        const comments = await prisma.comment.findMany({
            where: {
                timestamp: {
                    gte: oneHourAgo
                }
            },
            include: {
                author: { select: { name: true } },
                order: { select: { id: true, barcode: true } }
            },
            orderBy: { timestamp: 'desc' }
        });

        if (comments.length === 0) {
            console.log("No comments found in the last hour.");
        } else {
            console.table(comments.map(c => ({
                id: c.id,
                orderId: c.orderId,
                barcode: c.order?.barcode,
                author: c.author?.name,
                message: c.message.substring(0, 50),
                type: c.type,
                timestamp: c.timestamp
            })));
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
