import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log("Checking database connection...")
    try {
        const commentCount = await prisma.comment.count()
        console.log(`Connection successful. Total comments: ${commentCount}`)
    } catch (e: any) {
        console.error("Connection failed:", e.message)
        return
    }

    const orderId = 290
    console.log(`Checking comments for Order #${orderId}...`)
    const comments = await prisma.comment.findMany({
        where: { orderId: orderId },
        orderBy: { timestamp: 'asc' },
        include: {
            author: { select: { name: true } }
        }
    })

    console.log(`Found ${comments.length} comments for Order #${orderId}:`)
    comments.forEach(c => {
        console.log(`- [${c.timestamp.toISOString()}] by ${c.author.name} (Type: ${c.type}): "${c.message}" | Attachments: ${c.attachments ? 'Yes' : 'No'}`)
    })
}

main().catch(console.error).finally(() => prisma.$disconnect())
