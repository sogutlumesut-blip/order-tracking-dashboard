import { PrismaClient } from "@prisma/client"
import path from "path"

export function isDemoMode(): boolean {
    return process.env.DKM_DEMO_MODE === "1" || process.env.NEXT_PUBLIC_DKM_DEMO_MODE === "1";
}

const globalForPrisma = globalThis as unknown as {
    prisma_oms: PrismaClient | undefined
}

const getPrismaClient = () => {
    // DEMO MODE: Canli PostgreSQL veritabanina KESINLIKLE baglanma; yalnizca yerel SQLite demo DB kullan.
    if (isDemoMode()) {
        const demoUrl =
            process.env.DEMO_DATABASE_URL ||
            `file:${path.join(process.cwd(), "DKM_DEMO", "dkm-takip-demo.sqlite")}`;
        if (!demoUrl.startsWith("file:")) {
            throw new Error("GÜVENLİK: DEMO_DATABASE_URL yerel SQLite (file:) olmalıdır!");
        }
        // eslint-disable-next-line @typescript-eslint/no-require-imports, no-eval
        const demoClientPath = path.join(process.cwd(), "dkm-demo", "generated", "prisma-demo");
        const { PrismaClient: DemoPrismaClient } = eval("require")(demoClientPath);
        return new DemoPrismaClient({
            datasources: { db: { url: demoUrl } },
        }) as unknown as PrismaClient;
    }

    let databaseUrl = process.env.DATABASE_URL
    if (databaseUrl) {
        try {
            const urlObj = new URL(databaseUrl);
            
            // For Neon PostgreSQL: use Neon's PgBouncer pooler (-pooler) to allow hundreds of concurrent connections
            // without exhausting direct database connection limits.
            if (urlObj.hostname.includes("neon.tech") && !urlObj.hostname.includes("-pooler")) {
                urlObj.hostname = urlObj.hostname.replace(/^(ep-[^.]+)/, "$1-pooler");
            }
            
            // Set connection_limit for PgBouncer / pooled connection
            const connLimit = process.env.DATABASE_CONNECTION_LIMIT || "15";
            urlObj.searchParams.set("connection_limit", connLimit);
            
            // Set connection establishment timeout
            const connectTimeout = process.env.DATABASE_CONNECT_TIMEOUT || "20";
            urlObj.searchParams.set("connect_timeout", connectTimeout);
            
            // Set connection pool acquisition timeout (30s)
            const poolTimeout = process.env.DATABASE_POOL_TIMEOUT || "30";
            urlObj.searchParams.set("pool_timeout", poolTimeout);
            
            // Enable pgbouncer mode for Neon pooler to prevent prepared statement errors
            if (urlObj.hostname.includes("-pooler") || databaseUrl.includes("-pooler")) {
                urlObj.searchParams.set("pgbouncer", "true");
            }
            
            databaseUrl = urlObj.toString();
            process.env.DATABASE_URL = databaseUrl;
        } catch (e) {
            // Fallback string manipulation if URL parsing fails
            if (databaseUrl.includes("neon.tech") && !databaseUrl.includes("-pooler")) {
                databaseUrl = databaseUrl.replace(/(ep-[^.]+)/, "$1-pooler");
            }
            // Strip any existing connection_limit, pool_timeout, and pgbouncer
            databaseUrl = databaseUrl.replace(/[&?]connection_limit=[^&]*/g, "");
            databaseUrl = databaseUrl.replace(/[&?]pool_timeout=[^&]*/g, "");
            databaseUrl = databaseUrl.replace(/[&?]connect_timeout=[^&]*/g, "");
            databaseUrl = databaseUrl.replace(/[&?]pgbouncer=[^&]*/g, "");
            
            const separator = databaseUrl.includes("?") ? "&" : "?";
            databaseUrl = `${databaseUrl}${separator}connection_limit=15&connect_timeout=20&pool_timeout=30&pgbouncer=true`;
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
