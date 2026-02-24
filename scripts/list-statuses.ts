
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('Listing all status columns...')

    const statuses = await prisma.statusColumn.findMany({
        orderBy: { order: 'asc' }
    })

    console.table(statuses)
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
