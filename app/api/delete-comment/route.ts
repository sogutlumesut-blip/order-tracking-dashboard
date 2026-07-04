import { db } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import fs from "fs"
import path from "path"

const LOG_PATH = path.join(process.cwd(), "oms_debug.log");

function logToFile(msg: string) {
    const ts = new Date().toISOString();
    try {
        fs.appendFileSync(LOG_PATH, `[${ts}] [API_DELETE_COMMENT] ${msg}\n`);
    } catch (e) { }
}

export async function DELETE(request: Request) {
    logToFile("Delete Comment API Started");
    try {
        const { searchParams } = new URL(request.url);
        const commentId = searchParams.get("commentId");

        if (!commentId) {
            return NextResponse.json({ error: "Geçersiz yorum kimliği" }, { status: 400 });
        }

        const session = await getSession();
        if (!session) {
            logToFile("FAILED: No session");
            return NextResponse.json({ error: "Oturum kapalı" }, { status: 401 });
        }

        const user = session.user;
        logToFile(`User: ${user.name} | Role: ${user.role} | Comment: ${commentId}`);

        // Check if user is an admin
        if (user.role !== 'admin') {
            logToFile(`FAILED: User ${user.name} is not admin (role: ${user.role})`);
            return NextResponse.json({ error: "Sadece yöneticiler yorumları silebilir." }, { status: 403 });
        }

        // Fetch comment to get orderId
        const comment = await db.comment.findUnique({
            where: { id: commentId }
        });

        if (!comment) {
            return NextResponse.json({ error: "Yorum bulunamadı" }, { status: 404 });
        }

        // Delete the comment
        await db.comment.delete({
            where: { id: commentId }
        });

        logToFile(`Comment deleted: ${commentId}`);

        // Log Activity
        await db.orderActivity.create({
            data: {
                orderId: comment.orderId,
                author: user.name,
                action: "COMMENT_DELETED_API",
                details: `Yorum/not silindi.`
            }
        });

        logToFile("SUCCESS");
        return NextResponse.json({ success: true });

    } catch (e: any) {
        logToFile(`CRITICAL ERR: ${e.message}`);
        console.error("API delete-comment failure:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
