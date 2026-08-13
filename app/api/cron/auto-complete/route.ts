import { NextResponse } from "next/server";
import { autoCompleteOldOrders } from "@/lib/auto-complete";
import { revalidatePath } from "next/cache";

export const dynamic = 'force-dynamic'; // Ensure it's not cached

export async function GET(req: Request) {
    try {
        const result = await autoCompleteOldOrders();
        
        if (result.error) {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

        revalidatePath("/");

        return NextResponse.json({
            success: true,
            message: `${result.count} orders auto-completed.`,
            count: result.count
        });

    } catch (e: any) {
        console.error("Auto-Complete Cron Error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
