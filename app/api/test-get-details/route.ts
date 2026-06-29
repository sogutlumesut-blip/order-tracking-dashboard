import { getOrderDetails } from "@/app/actions"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const orderIdStr = searchParams.get("orderId");
    const orderId = Number(orderIdStr);

    try {
        console.log(`[TEST_API] Calling getOrderDetails with: ${orderIdStr} -> ${orderId}`);
        const details = await getOrderDetails(orderId);
        return NextResponse.json({ success: true, details });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
