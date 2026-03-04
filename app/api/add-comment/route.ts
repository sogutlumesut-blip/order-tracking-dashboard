
import { db } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import fs from "fs"
import path from "path"

const LOG_PATH = path.join(process.cwd(), "oms_debug.log");

function logToFile(msg: string) {
    const ts = new Date().toISOString();
    try {
        fs.appendFileSync(LOG_PATH, `[${ts}] [API_COMMENT] ${msg}\n`);
    } catch (e) { }
}

export async function POST(request: Request) {
    logToFile("Add Comment API Started");
    try {
        const body = await request.json();
        const { orderId, message, attachments, type } = body;

        const session = await getSession();
        if (!session) {
            logToFile("FAILED: No session");
            return NextResponse.json({ error: "Oturum kapalı" }, { status: 401 });
        }

        const user = session.user;
        logToFile(`User: ${user.name} | Order: ${orderId} | Type: ${type}`);

        // 1. Create Comment
        const created = await db.comment.create({
            data: {
                message: (message || "").trim(),
                orderId: Number(orderId),
                authorId: user.id,
                type: type || "message",
                attachments: typeof attachments === 'string' ? attachments : JSON.stringify(attachments || [])
            }
        });

        logToFile(`Comment created: ${created.id}`);

        // 2. Update Order
        await db.order.update({
            where: { id: Number(orderId) },
            data: {
                hasNotification: true,
                updatedAt: new Date()
            }
        });

        // 3. Log Activity
        await db.orderActivity.create({
            data: {
                orderId: Number(orderId),
                author: user.name,
                action: "COMMENT_ADDED_API",
                details: `Yeni ${type === 'note' ? 'not' : 'mesaj'} yazıldı. (v42)`
            }
        });

        logToFile("SUCCESS");
        // revalidatePath("/"); // Optional, let's keep it skipped for speed
        return NextResponse.json({ success: true, comment: created });

    } catch (e: any) {
        logToFile(`CRITICAL ERR: ${e.message}`);
        console.error("API add-comment failure:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
