import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const comments = await prisma.comment.findMany({
        orderBy: { timestamp: 'desc' },
        take: 10,
        include: {
            order: {
                select: { id: true, customer: true }
            }
        }
    })

    console.log('Last 10 comments:')
    comments.forEach(c => {
        console.log(`ID: ${c.id}, Order: #${c.orderId} (${c.order?.customer}), Type: ${c.type}, Msg: ${c.message}, Time: ${c.timestamp.toISOString()}`)
    })
}

main()
    .catch(e => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
