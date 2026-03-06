import { NextResponse } from "next/server";
import { createDHLShipmentAction } from "@/app/actions";

// TEMPORARY: Exposing the DHL action to an unauthenticated POST for testing
export async function POST(req: Request) {
    try {
        const { orderId } = await req.json();
        const result = await createDHLShipmentAction(orderId, true); // Added 'bypassAuth: true' parameter manually
        return NextResponse.json(result);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
