import { NextResponse } from "next/server";
import { syncPrintMarktOrders } from "@/app/actions";
import { revalidatePath } from "next/cache";

export async function POST(req: Request) {
    try {
        console.log("PrintMarkt Webhook tetiklendi...");
        
        let targetOrderId: string | undefined = undefined;
        try {
            const body = await req.json();
            console.log("[PM_WEBHOOK] Payload JSON:", JSON.stringify(body));
            // Extract order ID from various common formats
            const rawId = body.id || body.order_id || body.order?.id || body.external_id || body.order_number;
            if (rawId) {
                targetOrderId = rawId.toString();
                console.log(`[PM_WEBHOOK] Detected target order ID: ${targetOrderId}`);
            }
        } catch (e: any) {
            console.log("[PM_WEBHOOK] Request has no JSON body or could not be parsed:", e.message);
        }
        
        // 1. PrintMarkt API veri eşitleme gecikmesini (replica lag) aşmak için 3 saniye bekliyoruz
        await new Promise(resolve => setTimeout(resolve, 3000));
        
                // 2. İlk senkronizasyon denemesi (hedef sipariş ID'si varsa onu çeker, yoksa son siparişleri çeker. Webhook çağrısı olduğu için hız limitini aşar)
        let res = await syncPrintMarktOrders(false, targetOrderId, true);
        
        // 3. Çift sigorta: Eğer ilk denemede yeni sipariş bulunamadıysa veya atlandıysa, 5 saniye daha bekleyip genel eşitleme yapılıyor
        if ((res && res.success && res.count === 0) || (res && res.skipped)) {
            console.log("PrintMarkt Webhook: İlk denemede yeni sipariş bulunamadı veya atlandı, 5s bekleniyor ve genel eşitleme yapılıyor...");
            await new Promise(resolve => setTimeout(resolve, 5000));
            res = await syncPrintMarktOrders(true); // Force sync to pull a larger window (120 orders)
        }
        
        if (res && res.success && res.count > 0) {
            console.log(`PrintMarkt Webhook: ${res.count} yeni sipariş başarıyla çekildi.`);
            // revalidatePath("/"); // Removed to prevent Vercel Serverless Function timeouts
        } else if (res && res.error) {
            console.error("PrintMarkt Webhook Sync Error:", res.error);
        }

        // Webhook'u başarılı şekilde tamamlayıp 200 OK dönüyoruz.
        return NextResponse.json({ success: true, message: "Webhook alındı ve başarıyla senkronize edildi." }, { status: 200 });
        
    } catch (error) {
        console.error("PrintMarkt Webhook Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function GET(req: Request) {
    return NextResponse.json({ status: "active", message: "PrintMarkt Webhook is listening" }, { status: 200 });
}
