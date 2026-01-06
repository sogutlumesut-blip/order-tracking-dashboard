
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
    console.log("Cleaning up demo orders...")

    // Delete orders with specific demo barcodes
    const demoBarcodes = ["1001", "1002", "1003"]

    const { count } = await prisma.order.deleteMany({
        where: {
            barcode: {
                in: demoBarcodes
            }
        }
    })

    console.log(`Deleted ${count} demo orders.`)
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
