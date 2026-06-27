import { NextResponse } from "next/server";
import { syncPrintMarktOrders } from "@/app/actions";
import { revalidatePath } from "next/cache";

export async function POST(req: Request) {
    try {
        console.log("PrintMarkt Webhook tetiklendi...");
        
        // PrintMarkt'ın kendi payload yapısı önemsiz,
        // Biz sadece bu çağrıyı bir "yeni sipariş var, gidip API'den çek" sinyali olarak kullanıyoruz.
        
        // 1. PrintMarkt API veri eşitleme gecikmesini (replica lag) aşmak için 3 saniye bekliyoruz
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 2. İlk senkronizasyon denemesi
        let res = await syncPrintMarktOrders(false);
        
        // 3. Çift sigorta: Eğer ilk denemede yeni sipariş bulunamadıysa (lag devam ediyorsa), 5 saniye daha bekleyip tekrar deniyoruz
        if (res && res.success && res.count === 0) {
            console.log("PrintMarkt Webhook: İlk denemede yeni sipariş bulunamadı, 5s bekleniyor...");
            await new Promise(resolve => setTimeout(resolve, 5000));
            res = await syncPrintMarktOrders(false);
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
