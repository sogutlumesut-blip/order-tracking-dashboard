
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const id = "5730fa1d-5157-4ccf-8444-f4a38cdde7c3";
    console.log(`Checking Activity ID: ${id}`)
    try {
        const activity = await prisma.orderActivity.findUnique({
            where: { id }
        })
        console.log("Activity found:", activity)
    } catch (e) {
        console.error("Fetch FAILED:", e)
    } finally {
        await prisma.$disconnect()
    }
}

main()
