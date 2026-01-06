import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
    prisma_oms: PrismaClient | undefined
}

export const db = globalForPrisma.prisma_oms ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma_oms = db
