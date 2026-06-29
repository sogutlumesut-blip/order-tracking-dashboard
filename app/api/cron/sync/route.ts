import { NextResponse } from "next/server";
import { syncWooCommerceOrders, syncPrintMarktOrders, syncEtsyOrders } from "@/app/actions";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        console.log("[CRON] Periodic Sync started...");
        
        // Run WooCommerce sync
        const wcRes = await syncWooCommerceOrders(false).catch(err => ({ error: err.message }));
        
        // Run PrintMarkt sync
        const pmRes = await syncPrintMarktOrders(false).catch(err => ({ error: err.message }));
        
        // Run Etsy sync
        const etsyRes = await syncEtsyOrders().catch(err => ({ error: err.message }));
        
        console.log("[CRON] Periodic Sync finished:", { wcRes, pmRes, etsyRes });
        
        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            results: {
                woocommerce: wcRes,
                printmarkt: pmRes,
                etsy: etsyRes
            }
        });
    } catch (e: any) {
        console.error("[CRON] Sync error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
