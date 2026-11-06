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
            
            // Set connection_limit defensively. 
            // 15 connections allows concurrency during sync & dashboard loads while staying safely below Neon direct limit (20).
            const connLimit = process.env.DATABASE_CONNECTION_LIMIT || "15";
            urlObj.searchParams.set("connection_limit", connLimit);
            
            // Set connection establishment timeout (20s gives Neon compute enough time to wake up if cold)
            const connectTimeout = process.env.DATABASE_CONNECT_TIMEOUT || "20";
            urlObj.searchParams.set("connect_timeout", connectTimeout);
            
            // Set connection pool acquisition timeout (30s prevents 'Timed out fetching a new connection from the connection pool')
            const poolTimeout = process.env.DATABASE_POOL_TIMEOUT || "30";
            urlObj.searchParams.set("pool_timeout", poolTimeout);
            
            // Ensure pgbouncer is NOT set, since we are connecting directly
            urlObj.searchParams.delete("pgbouncer");
            
            databaseUrl = urlObj.toString();
        } catch (e) {
            // Fallback string manipulation if URL parsing fails
            if (databaseUrl.includes("-pooler")) {
                databaseUrl = databaseUrl.replace("-pooler", "");
            }
            const connLimit = process.env.DATABASE_CONNECTION_LIMIT || "15";
            const connectTimeout = process.env.DATABASE_CONNECT_TIMEOUT || "20";
            const poolTimeout = process.env.DATABASE_POOL_TIMEOUT || "30";
            if (!databaseUrl.includes("connection_limit=")) {
                const separator = databaseUrl.includes("?") ? "&" : "?";
                databaseUrl = `${databaseUrl}${separator}connection_limit=${connLimit}&connect_timeout=${connectTimeout}&pool_timeout=${poolTimeout}`;
            }
            // Strip pgbouncer parameters if present in fallback
            databaseUrl = databaseUrl.replace(/[&?]pgbouncer=[^&]*/g, "");
            databaseUrl = databaseUrl.replace(/[&?]pool_timeout=[^&]*/g, "");
            databaseUrl = `${databaseUrl}&pool_timeout=${poolTimeout}`;
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
