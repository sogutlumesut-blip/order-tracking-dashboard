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
        const order = await db.order.findUnique({
            where: { id: orderId },
            include: {
                comments: {
                    include: { author: { select: { name: true } } },
                    orderBy: { timestamp: "asc" }
                },
                activities: {
                    orderBy: { timestamp: "desc" },
                    take: 20
                }
            }
        });

        if (!order) {
            return NextResponse.json({ comments: [], activities: [] });
        }

        return NextResponse.json({
            comments: order.comments.map(c => ({
                id: c.id,
                author: c.author?.name || "Bilinmeyen",
                message: c.message,
                timestamp: c.timestamp.toISOString(),
                attachments: c.attachments ? JSON.parse(c.attachments as string) : [],
                type: c.type || "message"
            })),
            activities: order.activities.map(a => ({
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
