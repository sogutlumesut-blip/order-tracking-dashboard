import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
    // Update 'pending' and 'processing' to 'Gelen Siparişler'
    const result1 = await db.order.updateMany({
        where: {
            OR: [
                { status: 'pending' },
                { status: 'processing' }
            ]
        },
        data: {
            status: 'Gelen Siparişler'
        }
    })

    // Update 'completed' to 'Kargolandı'
    const result2 = await db.order.updateMany({
        where: {
            status: 'completed'
        },
        data: {
            status: 'Kargolandı'
        }
    })

    console.log(`Updated ${result1.count} pending/processing orders to 'Gelen Siparişler'`)
    console.log(`Updated ${result2.count} completed orders to 'Kargolandı'`)
}

main()
    .finally(async () => {
        await db.$disconnect()
    })
