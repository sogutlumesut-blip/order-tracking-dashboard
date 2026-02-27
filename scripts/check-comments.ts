import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log("Checking recent comments...")
    const comments = await prisma.comment.findMany({
        take: 10,
        orderBy: { timestamp: 'desc' },
        include: {
            author: { select: { name: true } },
            order: { select: { id: true, customer: true } }
        }
    })

    console.log(`Found ${comments.length} recent comments:`)
    comments.forEach(c => {
        console.log(`- [${c.timestamp.toISOString()}] Order #${c.orderId} (${c.order.customer}): "${c.message}" by ${c.author.name} (Type: ${c.type})`)
    })
}

main().catch(console.error).finally(() => prisma.$disconnect())
