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

        // Fetch comment to get orderId, original author, message and attachments
        const comment = await db.comment.findUnique({
            where: { id: commentId },
            include: { author: { select: { name: true } } }
        });

        if (!comment) {
            return NextResponse.json({ error: "Yorum bulunamadı" }, { status: 404 });
        }

        // Delete the comment
        await db.comment.delete({
            where: { id: commentId }
        });

        logToFile(`Comment deleted: ${commentId}`);

        // Parse attachments if any
        let attachmentNames: string[] = [];
        if (comment.attachments) {
            try {
                const parsed = JSON.parse(comment.attachments);
                if (Array.isArray(parsed)) {
                    attachmentNames = parsed
                        .map((att: any) => att.name || (att.type === 'image' ? 'Görsel' : 'Dosya'))
                        .filter(Boolean);
                }
            } catch (e) { }
        }

        const trimmedMsg = (comment.message || "").trim();
        const msgSnippet = trimmedMsg
            ? (trimmedMsg.length > 60 ? `"${trimmedMsg.substring(0, 60)}..."` : `"${trimmedMsg}"`)
            : "";

        const hasFiles = attachmentNames.length > 0;
        const hasMsg = Boolean(trimmedMsg);
        const originalAuthor = comment.author?.name || "Bilinmeyen";
        const isSelf = originalAuthor === user.name;

        let details = "";
        if (comment.type === "note") {
            const who = isSelf ? "Kendi eklediği işlem notunu" : `${originalAuthor} tarafından eklenen işlem notunu`;
            const fileInfo = hasFiles ? ` (Ek: ${attachmentNames.join(", ")})` : "";
            details = `${who} sildi.${msgSnippet ? ` Not: ${msgSnippet}` : ""}${fileInfo}`;
        } else {
            const who = isSelf ? "Kendi ilettiği" : `${originalAuthor} tarafından iletilen`;
            if (hasFiles && hasMsg) {
                details = `${who} dosya ve mesajı sildi: ${msgSnippet} [${attachmentNames.join(", ")}]`;
            } else if (hasFiles) {
                details = `${who} dosyayı sildi: [${attachmentNames.join(", ")}]`;
            } else if (hasMsg) {
                details = `${who} mesajı sildi: ${msgSnippet}`;
            } else {
                details = `${who} yazışmayı sildi.`;
            }
        }

        // Log Activity
        const activity = await db.orderActivity.create({
            data: {
                orderId: comment.orderId,
                author: user.name,
                action: "COMMENT_DELETED_API",
                details
            }
        });

        // Touch order updatedAt
        await db.order.update({
            where: { id: comment.orderId },
            data: { updatedAt: new Date() }
        }).catch(() => {});

        logToFile(`SUCCESS: Logged activity ${activity.id}`);
        return NextResponse.json({
            success: true,
            activity: {
                id: activity.id,
                author: activity.author,
                action: activity.action,
                details: activity.details,
                timestamp: activity.timestamp.toISOString()
            }
        });

    } catch (e: any) {
        logToFile(`CRITICAL ERR: ${e.message}`);
        console.error("API delete-comment failure:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
