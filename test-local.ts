import { createDHLShipmentAction } from './app/actions'
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  console.log("Calling createDHLShipmentAction for 1133...")
  try {
    const res = await createDHLShipmentAction(1133, true) // bypassAuth = true
    console.log("Result:", res)
  } catch (e) {
    console.error("Error:", e)
  }
}
main().finally(() => prisma.$disconnect())
