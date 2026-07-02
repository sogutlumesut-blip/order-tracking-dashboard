import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
    prisma_oms: PrismaClient | undefined
}

const getPrismaClient = () => {
    const databaseUrl = process.env.DATABASE_URL
    if (databaseUrl) {
        // Automatically append connection_limit=15 if not already set, to prevent queuing timeouts
        if (!databaseUrl.includes("connection_limit=")) {
            const separator = databaseUrl.includes("?") ? "&" : "?"
            const pooledUrl = `${databaseUrl}${separator}connection_limit=15`
            return new PrismaClient({
                datasources: {
                    db: {
                        url: pooledUrl
                    }
                }
            })
        }
    }
    return new PrismaClient()
}

export const db = globalForPrisma.prisma_oms ?? getPrismaClient()

globalForPrisma.prisma_oms = db
