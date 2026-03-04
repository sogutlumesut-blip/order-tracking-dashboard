import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    try {
        console.log("Checking all comments created in the last 24 hours...");
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const comments = await prisma.comment.findMany({
            where: {
                timestamp: {
                    gte: yesterday
                }
            },
            include: {
                author: { select: { name: true } },
                order: { select: { id: true, barcode: true, customer: true } }
            },
            orderBy: { timestamp: 'desc' }
        });

        if (comments.length === 0) {
            console.log("No comments found in the last 24 hours.");
        } else {
            console.table(comments.map(c => ({
                id: c.id,
                orderId: c.orderId,
                barcode: c.order?.barcode,
                customer: c.order?.customer,
                author: c.author?.name,
                message: c.message,
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
