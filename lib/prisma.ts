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
            // 20 connections allows high concurrency during sync & dashboard loads while staying safely within Neon limit.
            const rawConnLimit = parseInt(process.env.DATABASE_CONNECTION_LIMIT || "20", 10);
            const connLimit = String(isNaN(rawConnLimit) || rawConnLimit < 20 ? 20 : rawConnLimit);
            urlObj.searchParams.set("connection_limit", connLimit);
            
            // Set connection establishment timeout (30s gives Neon compute enough time to wake up if cold)
            urlObj.searchParams.set("connect_timeout", "30");
            
            // Set connection pool acquisition timeout to 0 (no timeout / wait indefinitely for connection)
            // Setting pool_timeout=0 instructs Prisma's connection pool to wait for an available connection rather than crashing after 10s
            urlObj.searchParams.set("pool_timeout", "0");
            
            // Ensure pgbouncer is NOT set, since we are connecting directly
            urlObj.searchParams.delete("pgbouncer");
            
            databaseUrl = urlObj.toString();
            // CRITICAL: Overwrite process.env.DATABASE_URL so the underlying Prisma Rust query engine
            // also picks up pool_timeout=0 and connection_limit=20!
            process.env.DATABASE_URL = databaseUrl;
        } catch (e) {
            // Fallback string manipulation if URL parsing fails
            if (databaseUrl.includes("-pooler")) {
                databaseUrl = databaseUrl.replace("-pooler", "");
            }
            // Strip any existing connection_limit, pool_timeout, and pgbouncer
            databaseUrl = databaseUrl.replace(/[&?]connection_limit=[^&]*/g, "");
            databaseUrl = databaseUrl.replace(/[&?]pool_timeout=[^&]*/g, "");
            databaseUrl = databaseUrl.replace(/[&?]connect_timeout=[^&]*/g, "");
            databaseUrl = databaseUrl.replace(/[&?]pgbouncer=[^&]*/g, "");
            
            const separator = databaseUrl.includes("?") ? "&" : "?";
            databaseUrl = `${databaseUrl}${separator}connection_limit=20&connect_timeout=30&pool_timeout=0`;
            process.env.DATABASE_URL = databaseUrl;
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
