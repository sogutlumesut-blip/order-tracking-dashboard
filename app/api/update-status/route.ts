
import { db } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import fs from "fs"
import path from "path"

const LOG_PATH = path.join(process.cwd(), "oms_debug.log");

function logToFile(msg: string) {
    const ts = new Date().toISOString();
    try {
        fs.appendFileSync(LOG_PATH, `[${ts}] [API_STATUS] ${msg}\n`);
    } catch (e) { }
}

export async function POST(request: Request) {
    logToFile("API Call Started");
    try {
        const body = await request.json();
        const { orderId, status, version } = body;

        if (!orderId || !status) {
            logToFile("ERR: Missing orderId or status");
            return NextResponse.json({ error: "Missing fields" }, { status: 400 });
        }

        const session = await getSession();
        const user = session?.user?.name || "Sistem (API)";

        logToFile(`Updating #${orderId} to ${status} (v:${version}) by ${user}`);

        // 1. Log Activity
        await db.orderActivity.create({
            data: {
                orderId: Number(orderId),
                author: user,
                action: "STATUS_CHANGE_API",
                details: `Durum '${status}' olarak güncellendi (API v14)`
            }
        });

        // 2. Update DB
        const updated = await db.order.update({
            where: { id: Number(orderId) },
            data: {
                status,
                hasNotification: true,
                updatedAt: new Date()
            }
        });

        logToFile(`SUCCESS: #${orderId} matches ${updated.status}`);

        return NextResponse.json({ success: true, newStatus: updated.status });

    } catch (e: any) {
        logToFile(`CRITICAL ERR: ${e.message}`);
        console.error("API update-status failure:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
