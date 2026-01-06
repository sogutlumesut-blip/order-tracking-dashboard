import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
    const statuses = await db.statusColumn.findMany()
    console.log("--- Status Columns ---")
    statuses.forEach(s => {
        console.log(`Title: ${s.title} | ID: ${s.id}`)
    })
}

main()
    .finally(async () => {
        await db.$disconnect()
    })
