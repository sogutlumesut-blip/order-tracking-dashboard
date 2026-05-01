import { NextResponse } from "next/server";
import { syncPrintMarktOrders } from "@/app/actions";
import { revalidatePath } from "next/cache";

export async function POST(req: Request) {
    try {
        console.log("PrintMarkt Webhook tetiklendi...");
        
        // PrintMarkt'ın kendi payload yapısı önemsiz,
        // Biz sadece bu çağrıyı bir "yeni sipariş var, gidip API'den çek" sinyali olarak kullanıyoruz.
        
        // Asenkron olarak sync işlemini başlat (webhook'a hemen cevap dönmek için)
        syncPrintMarktOrders(false).then((res: any) => {
            if (res && res.success && res.count > 0) {
                console.log(`PrintMarkt Webhook: ${res.count} yeni sipariş başarıyla çekildi.`);
                revalidatePath("/");
            } else if (res && res.error) {
                console.error("PrintMarkt Webhook Sync Error:", res.error);
            }
        }).catch(err => {
            console.error("PrintMarkt Webhook Sync Exception:", err);
        });

        // Webhook'u bekletmeden 200 OK dönüyoruz.
        return NextResponse.json({ success: true, message: "Webhook alındı, eşitleme arka planda başlatıldı." }, { status: 200 });
        
    } catch (error) {
        console.error("PrintMarkt Webhook Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function GET(req: Request) {
    return NextResponse.json({ status: "active", message: "PrintMarkt Webhook is listening" }, { status: 200 });
}
