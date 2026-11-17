import { NextResponse } from "next/server";
import { upsertFaireOrder, FaireOrder } from "@/lib/faire";
import { db } from "@/lib/prisma";

export async function POST(req: Request) {
    try {
        const body = await req.json();

        // Check if payload contains an order object or order array
        const orderPayload: FaireOrder = body.order || body.data || body;

        if (!orderPayload || (!orderPayload.id && !orderPayload.display_id)) {
            return NextResponse.json({ error: "Geçersiz sipariş verisi." }, { status: 400 });
        }

        // Determine default status: target "pending_pm" (Bekliyor (PrintMarkt))
        const statuses = await db.statusColumn.findMany({ orderBy: { order: 'asc' } });
        let defaultStatus = "pending_pm";
        const pmStatus = statuses.find(s =>
            s.id === "pending_pm" ||
            s.title.toLowerCase().includes("printmarkt")
        );
        if (pmStatus) defaultStatus = pmStatus.id;

        const res = await upsertFaireOrder(orderPayload, {
            defaultStatus
        });

        if (!res.success) {
            return NextResponse.json({ error: res.error }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            isNew: res.isNew,
            message: `Faire siparişi #${orderPayload.display_id || orderPayload.id} Bekliyor (PrintMarkt) durumuna başarıyla işlendi.`
        });
    } catch (e: any) {
        console.error("[FAIRE_WEBHOOK_ERROR]", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({ status: "Faire webhook endpoint active." });
}
