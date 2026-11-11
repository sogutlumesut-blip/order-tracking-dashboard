import { NextRequest, NextResponse } from "next/server";
import { executeCreateMaterialOrder } from "@/lib/manual-order";
import { getSession } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const session = await getSession().catch(() => null);
        const body = await req.json();

        if (!body) {
            return NextResponse.json({ success: false, error: "Geçersiz istek gövdesi" }, { status: 400 });
        }

        const result = await executeCreateMaterialOrder(body, session?.user?.name);
        if (!result.success) {
            return NextResponse.json(result, { status: 400 });
        }

        return NextResponse.json(result);
    } catch (err: any) {
        console.error("API create-material error:", err);
        return NextResponse.json({ success: false, error: err?.message || "Sunucu hatası" }, { status: 500 });
    }
}
