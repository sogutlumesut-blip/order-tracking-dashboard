import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    try {
        const orderId = 290;
        const authorId = 'd8604d44-c4ec-4626-bee1-9fa79a114abc'; // Admin User

        console.log(`Manually creating a test comment for Order #${orderId}...`);

        const comment = await prisma.comment.create({
            data: {
                message: "SYSTEM TEST MESSAGE - " + new Date().toISOString(),
                orderId: orderId,
                authorId: authorId,
                type: 'message',
                attachments: '[]'
            }
        });

        console.log("Comment Created Successfully:", comment.id);

        const activity = await prisma.orderActivity.create({
            data: {
                orderId: orderId,
                author: "System Test",
                action: "COMMENT_ADDED",
                details: "System test message added."
            }
        });
        console.log("Activity Logged:", activity.id);

    } catch (e) {
        console.error("CREATE ERROR:", e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
