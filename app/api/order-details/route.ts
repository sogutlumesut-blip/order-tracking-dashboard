import { db } from "@/lib/prisma"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const orderIdStr = searchParams.get("orderId");
    const orderId = Number(orderIdStr);

    if (isNaN(orderId)) {
        return NextResponse.json({ error: "Geçersiz sipariş numarası" }, { status: 400 });
    }

    try {
        const [order, comments, activities] = await Promise.all([
            db.order.findUnique({
                where: { id: orderId }
            }),
            db.comment.findMany({
                where: { orderId },
                include: { author: { select: { name: true } } },
                orderBy: { timestamp: "asc" }
            }),
            db.orderActivity.findMany({
                where: { orderId },
                orderBy: { timestamp: "desc" },
                take: 25 // Limit to latest 25 activities for high performance
            })
        ]);

        if (!order) {
            return NextResponse.json({ comments: [], activities: [] });
        }

        return NextResponse.json({
            comments: comments.map(c => ({
                id: c.id,
                author: c.author?.name || "Bilinmeyen",
                message: c.message,
                timestamp: c.timestamp.toISOString(),
                attachments: c.attachments ? JSON.parse(c.attachments as string) : [],
                type: c.type || "message"
            })),
            activities: activities.map(a => ({
                id: a.id,
                author: a.author,
                action: a.action,
                details: a.details,
                timestamp: a.timestamp.toISOString()
            }))
        });
    } catch (e: any) {
        console.error(`[REST_API] Error fetching details for #${orderId}:`, e);
        return NextResponse.json({ error: e.message || "Veri çekme hatası" }, { status: 500 });
    }
}
