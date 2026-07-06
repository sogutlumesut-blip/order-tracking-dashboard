import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Oturum kapalı" }, { status: 401 });
        }

        // Fetch fresh user data to get allowedStatuses
        let allowedStatuses = null;
        const isAdmin = session.user.role === 'admin';

        try {
            const user = await db.user.findUnique({
                where: { id: session.user.id },
                select: { allowedStatuses: true } as any
            }) as any;

            if (user?.allowedStatuses) {
                allowedStatuses = JSON.parse(user.allowedStatuses);
            }
        } catch (e) {
            console.error("Failed to fetch user permissions:", e);
        }

        let visibleStatuses: string[] | null = null;
        if (!isAdmin && allowedStatuses && Array.isArray(allowedStatuses)) {
            const filtered = allowedStatuses.filter((s: string) => s !== "MANUAL_SYNC");
            if (filtered.length > 0) {
                visibleStatuses = filtered;
            }
        }

        const terminalStatuses = ["shipped", "completed", "cancelled"];
        let activeStatuses = ["pending_woo", "pending_pm", "draft", "Awaiting Approval", "Approved", "In print", "Ready/Packaged"];

        try {
            const dbColumns = await db.statusColumn.findMany({ select: { id: true } });
            if (dbColumns.length > 0) {
                const allStatusIds = dbColumns.map(c => c.id);
                activeStatuses = allStatusIds.filter(id => !terminalStatuses.includes(id));
            }
        } catch (e) {
            console.error("Failed to fetch dynamic statuses", e);
        }

        let targetActive = activeStatuses;
        let targetTerminal = terminalStatuses;

        if (visibleStatuses) {
            targetActive = activeStatuses.filter(s => visibleStatuses!.includes(s));
            targetTerminal = terminalStatuses.filter(s => visibleStatuses!.includes(s));
        }

        const orderSelect = {
            id: true,
            customer: true,
            phone: true,
            email: true,
            address: true,
            city: true,
            total: true,
            status: true,
            date: true,
            note: true,
            labels: true,
            trackingNumber: true,
            printNotes: true,
            paymentMethod: true,
            barcode: true,
            assignedTo: true,
            cargoBarcode: true,
            cargoTrackingNumber: true,
            customDesi: true,
            customWeight: true,
            taxNumber: true,
            taxOffice: true,
            invoiceStatus: true,
            invoiceUrl: true,
            createdAt: true,
            updatedAt: true,
            hasNotification: true,
            externalId: true,
            source: true,
            items: true,
            comments: {
                orderBy: { timestamp: "desc" as const },
                take: 1,
                select: {
                    id: true,
                    message: true,
                    type: true,
                    timestamp: true,
                    author: {
                        select: {
                            name: true
                        }
                    }
                }
            },
            _count: {
                select: { comments: true }
            }
        };

        const activeOrdersPromise = targetActive.length > 0 ? db.order.findMany({
            where: { status: { in: targetActive } },
            orderBy: { date: "desc" },
            select: orderSelect
        }) : Promise.resolve([]);

        const terminalOrdersPromise = targetTerminal.length > 0 ? db.order.findMany({
            where: { status: { in: targetTerminal } },
            orderBy: { date: "desc" },
            take: 200,
            select: orderSelect
        }) : Promise.resolve([]);

        const [activeOrders, terminalOrders] = await Promise.all([activeOrdersPromise, terminalOrdersPromise]);
        const orders = [...activeOrders, ...terminalOrders];

        const returnedOrderIds = orders.map(o => o.id);
        const ordersWithPdf = returnedOrderIds.length > 0 ? await db.order.findMany({
            where: {
                id: { in: returnedOrderIds },
                cargoLabelPdf: { not: null }
            },
            select: { id: true }
        }) : [];
        const pdfIds = new Set(ordersWithPdf.map(o => o.id));

        const serialized = orders.map(order => ({
            hasCargoPdf: pdfIds.has(order.id),
            ...order,
            date: order.date.toISOString(),
            createdAt: order.createdAt.toISOString(),
            updatedAt: order.updatedAt.toISOString(),
            total: order.total || "0 ₺",
            items: order.items.map(item => ({
                ...item,
                sku: item.sku || null,
                image_src: item.image_src?.startsWith('data:image') 
                    ? `/api/order-image/${item.id}` 
                    : (item.image_src && (item.image_src.startsWith('/api/uploads/') || item.image_src.startsWith('/uploads/') || item.image_src.startsWith('uploads/'))
                        ? `https://printmarkt.co${item.image_src.startsWith('/') ? '' : '/'}${item.image_src}`
                        : item.image_src),
                url: item.url?.startsWith('data:') ? `/api/order-url/${item.id}` : item.url,
                material: item.material || null,
                dimensions: item.dimensions || null,
            })),
            comments: (order as any).comments ? (order as any).comments.map((c: any) => ({
                id: c.id,
                message: c.message,
                type: c.type || "message",
                timestamp: c.timestamp.toISOString(),
                author: c.author?.name || "Unknown"
            })) : [],
            commentCount: order._count?.comments || 0,
            labels: (() => {
                if (!order.labels) return [];
                try {
                    const parsed = typeof order.labels === 'string' ? JSON.parse(order.labels) : order.labels;
                    return Array.isArray(parsed) ? parsed : [];
                } catch (e) {
                    return [];
                }
            })(),
            _count: undefined
        }));

        return NextResponse.json(serialized);
    } catch (e: any) {
        return NextResponse.json({ error: e.message || "Bilinmeyen hata" }, { status: 500 });
    }
}
