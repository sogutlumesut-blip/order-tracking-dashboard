import { NextRequest, NextResponse } from "next/server";
import { generateDHLShipment } from "@/lib/cargo-service";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Oturum kapalı" }, { status: 401 });
        }

        const body = await req.json();
        const { orderId } = body;

        if (!orderId) {
            return NextResponse.json({ error: "Geçersiz sipariş ID" }, { status: 400 });
        }

        const res = await generateDHLShipment(orderId, session.user.name, false);
        return NextResponse.json(res);
    } catch (e: any) {
        return NextResponse.json({ error: e.message || "Bilinmeyen bir hata oluştu" }, { status: 500 });
    }
}
