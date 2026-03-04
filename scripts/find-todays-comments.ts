import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    try {
        console.log("Searching for ANY comments added today (March 2, 2026)...");
        const startOfDay = new Date('2026-03-02T00:00:00Z');
        const comments = await prisma.comment.findMany({
            where: {
                timestamp: {
                    gte: startOfDay
                }
            },
            include: {
                author: { select: { name: true } },
                order: { select: { id: true, externalId: true } }
            },
            orderBy: { timestamp: 'desc' }
        });

        if (comments.length === 0) {
            console.log("No comments found for today.");
        } else {
            console.table(comments.map(c => ({
                id: c.id,
                order: c.order?.id,
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
