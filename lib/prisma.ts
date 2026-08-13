import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
    prisma_oms: PrismaClient | undefined
}

const getPrismaClient = () => {
    let databaseUrl = process.env.DATABASE_URL
    if (databaseUrl) {
        const isPooler = databaseUrl.includes("-pooler") || databaseUrl.includes("pgbouncer=true");
        try {
            const urlObj = new URL(databaseUrl);
            
            // Persistent Next.js server workers default to connection_limit=12 to prevent pool starvation, staying below Neon's 20 limit
            const connLimit = process.env.DATABASE_CONNECTION_LIMIT || "12";
            urlObj.searchParams.set("connection_limit", connLimit);
            
            // Add connection timeouts to prevent sockets from hanging indefinitely
            urlObj.searchParams.set("connect_timeout", "10");
            urlObj.searchParams.set("pool_timeout", "10");
            
            // Neon/PgBouncer pooler requires pgbouncer=true to prevent prepared statement errors in transaction mode
            if (isPooler) {
                urlObj.searchParams.set("pgbouncer", "true");
            }
            
            databaseUrl = urlObj.toString();
        } catch (e) {
            // Fallback string manipulation if URL parsing fails
            if (!databaseUrl.includes("connection_limit=")) {
                const separator = databaseUrl.includes("?") ? "&" : "?";
                databaseUrl = `${databaseUrl}${separator}connection_limit=12&connect_timeout=10&pool_timeout=10`;
            }
            if (isPooler && !databaseUrl.includes("pgbouncer=")) {
                const separator = databaseUrl.includes("?") ? "&" : "?";
                databaseUrl = `${databaseUrl}${separator}pgbouncer=true`;
            }
        }
        
        return new PrismaClient({
            datasources: {
                db: {
                    url: databaseUrl
                }
            }
        });
    }
    return new PrismaClient()
}

export const db = globalForPrisma.prisma_oms ?? getPrismaClient()

globalForPrisma.prisma_oms = db
