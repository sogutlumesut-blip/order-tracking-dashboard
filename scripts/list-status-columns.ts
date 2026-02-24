
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log("Listing Status Columns...")
    const cols = await prisma.statusColumn.findMany({
        orderBy: { order: 'asc' }
    })
    console.table(cols)
    await prisma.$disconnect()
}

main()
