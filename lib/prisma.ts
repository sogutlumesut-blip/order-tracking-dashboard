import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
    prisma_oms: PrismaClient | undefined
}

const getPrismaClient = () => {
    let databaseUrl = process.env.DATABASE_URL
    if (databaseUrl) {
        try {
            const urlObj = new URL(databaseUrl);
            
            // Convert pooled connection to direct connection by stripping '-pooler' from hostname.
            // Direct connections bypass PgBouncer, preventing connection leaks and "idle in transaction" locks.
            if (urlObj.hostname.includes("-pooler")) {
                urlObj.hostname = urlObj.hostname.replace("-pooler", "");
            }
            
            // Set connection_limit defensively. On persistent single-replica servers, 
            // a limit of 10 connections is perfect to handle concurrency while staying below Neon's 20 limit.
            const connLimit = process.env.DATABASE_CONNECTION_LIMIT || "10";
            urlObj.searchParams.set("connection_limit", connLimit);
            
            // Set connection establishment timeout
            urlObj.searchParams.set("connect_timeout", "10");
            
            // Ensure pgbouncer is NOT set, since we are connecting directly
            urlObj.searchParams.delete("pgbouncer");
            urlObj.searchParams.delete("pool_timeout");
            
            databaseUrl = urlObj.toString();
        } catch (e) {
            // Fallback string manipulation if URL parsing fails
            if (databaseUrl.includes("-pooler")) {
                databaseUrl = databaseUrl.replace("-pooler", "");
            }
            if (!databaseUrl.includes("connection_limit=")) {
                const separator = databaseUrl.includes("?") ? "&" : "?";
                databaseUrl = `${databaseUrl}${separator}connection_limit=10&connect_timeout=10`;
            }
            // Strip pgbouncer parameters if present in fallback
            databaseUrl = databaseUrl.replace(/[&?]pgbouncer=[^&]*/g, "");
            databaseUrl = databaseUrl.replace(/[&?]pool_timeout=[^&]*/g, "");
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
