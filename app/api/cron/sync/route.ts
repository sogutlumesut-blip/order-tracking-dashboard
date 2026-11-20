import { NextResponse } from "next/server";
import { syncWooCommerceOrders, syncPrintMarktOrders, syncEtsyOrders, syncWayfairOrders, syncShopifyOrders, syncCargoKargoEntegrator, syncOzonOrders, syncFaireOrders } from "@/app/actions";

export const dynamic = 'force-dynamic';

// Global server-side mutex & cooldown to prevent overlapping or redundant sync executions
const globalForCron = globalThis as unknown as {
    cronSyncInProgress?: boolean;
    cronLastSyncTime?: number;
    cronLastPmSyncTime?: number;
};

export async function GET(req: Request) {
    const now = Date.now();
    const url = new URL(req.url);
    const source = url.searchParams.get("source")?.toLowerCase();

    // Fast-path for PrintMarkt auto-sync: executes quickly (<1s) without blocking or waiting for other slower platforms
    if (source === "pm" || source === "printmarkt") {
        const lastPmSync = globalForCron.cronLastPmSyncTime || 0;
        if (now - lastPmSync < 20000) {
            return NextResponse.json({ skipped: true, reason: "PM Cooldown active", remainingSec: Math.round((20000 - (now - lastPmSync)) / 1000) });
        }
        globalForCron.cronLastPmSyncTime = now;
        try {
            const pmRes = await syncPrintMarktOrders(false, undefined, true).catch(err => ({ error: err.message }));
            return NextResponse.json({
                success: true,
                timestamp: new Date().toISOString(),
                results: { printmarkt: pmRes }
            });
        } catch (e: any) {
            return NextResponse.json({ error: e.message }, { status: 500 });
        }
    }

    const lastSync = globalForCron.cronLastSyncTime || 0;

    // Cooldown: ensure at least 60 seconds between sync executions across all clients
    if (globalForCron.cronSyncInProgress) {
        return NextResponse.json({ skipped: true, reason: "Sync already in progress" });
    }
    if (now - lastSync < 60000) {
        return NextResponse.json({ skipped: true, reason: "Cooldown active", remainingSec: Math.round((60000 - (now - lastSync)) / 1000) });
    }

    globalForCron.cronSyncInProgress = true;
    try {
        console.log("[CRON] Periodic Sync started...");
        
        // 1. Run PrintMarkt sync (highest priority)
        const pmRes = await syncPrintMarktOrders(false).catch(err => ({ error: err.message }));
        
        // 2. Run Shopify sync
        const shopifyRes = await syncShopifyOrders(false).catch(err => ({ error: err.message }));

        // 3. Run WooCommerce sync
        const wcRes = await syncWooCommerceOrders(false).catch(err => ({ error: err.message }));
        
        // 4. Run Wayfair sync
        const wfRes = await syncWayfairOrders(false).catch(err => ({ error: err.message }));

        // 5. Run Etsy sync
        const etsyRes = await syncEtsyOrders().catch(err => ({ error: err.message }));

        // 6. Run Cargo sync
        const cargoRes = await syncCargoKargoEntegrator(false).catch(err => ({ error: err.message }));

        // 7. Run Ozon sync
        const ozonRes = await syncOzonOrders(false).catch(err => ({ error: err.message }));
        
        // 8. Run Faire sync
        const faireRes = await syncFaireOrders(false).catch(err => ({ error: err.message }));

        globalForCron.cronLastSyncTime = Date.now();
        console.log("[CRON] Periodic Sync finished:", { pmRes, shopifyRes, wcRes, wfRes, etsyRes, cargoRes, ozonRes, faireRes });
        
        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            results: {
                printmarkt: pmRes,
                shopify: shopifyRes,
                woocommerce: wcRes,
                wayfair: wfRes,
                etsy: etsyRes,
                cargo: cargoRes,
                ozon: ozonRes,
                faire: faireRes
            }
        });
    } catch (e: any) {
        console.error("[CRON] Sync error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    } finally {
        globalForCron.cronSyncInProgress = false;
    }
}
