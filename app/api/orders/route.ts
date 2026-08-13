import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/prisma";
import { parseUserPermissions } from "@/lib/permissions";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Oturum kapalı" }, { status: 401 });
        }

        const terminalStatuses = ["shipped", "completed", "cancelled"];
        let activeStatuses = ["pending_woo", "pending_pm", "draft", "Awaiting Approval", "Approved", "In print", "Ready/Packaged"];
        let allStatusIds = [...activeStatuses, ...terminalStatuses];

        try {
            const dbColumns = await db.statusColumn.findMany({ select: { id: true } });
            if (dbColumns.length > 0) {
                allStatusIds = dbColumns.map(c => c.id);
                activeStatuses = allStatusIds.filter(id => !terminalStatuses.includes(id));
            }
        } catch (e) {
            console.error("Failed to fetch dynamic statuses", e);
        }

        // Fetch fresh user data to get allowedStatuses
        let userAllowedStatusesStr: string | null = null;
        const isAdmin = session.user.role === 'admin';

        try {
            const user = await db.user.findUnique({
                where: { id: session.user.id },
                select: { allowedStatuses: true } as any
            }) as any;
            userAllowedStatusesStr = user?.allowedStatuses || null;
        } catch (e) {
            console.error("Failed to fetch user permissions:", e);
        }

        const permissions = parseUserPermissions(userAllowedStatusesStr, allStatusIds);

        let targetActive = activeStatuses;
        let targetTerminal = terminalStatuses;

        if (!isAdmin) {
            targetActive = activeStatuses.filter(s => permissions.view.includes(s));
            targetTerminal = terminalStatuses.filter(s => permissions.view.includes(s));
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
            cargoLabelPdf: true,
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
        const { searchParams } = new URL(req.url);
        const search = searchParams.get("search") || "";

        let activeOrdersPromise;
        let terminalOrdersPromise;

        if (search) {
            const searchFilter = {
                OR: [
                    { customer: { contains: search, mode: 'insensitive' as const } },
                    { phone: { contains: search } },
                    { email: { contains: search, mode: 'insensitive' as const } },
                    { barcode: { contains: search, mode: 'insensitive' as const } },
                    { trackingNumber: { contains: search, mode: 'insensitive' as const } },
                    { cargoTrackingNumber: { contains: search, mode: 'insensitive' as const } },
                ]
            };

            if (!isNaN(Number(search))) {
                (searchFilter.OR as any).push({ id: Number(search) });
            }

            activeOrdersPromise = targetActive.length > 0 ? db.order.findMany({
                where: {
                    status: { in: targetActive },
                    ...searchFilter
                },
                orderBy: { date: "desc" },
                select: orderSelect
            }) : Promise.resolve([]);

            terminalOrdersPromise = targetTerminal.length > 0 ? db.order.findMany({
                where: {
                    status: { in: targetTerminal },
                    ...searchFilter
                },
                orderBy: { date: "desc" },
                select: orderSelect
            }) : Promise.resolve([]);
        } else {
            activeOrdersPromise = targetActive.length > 0 ? db.order.findMany({
                where: { status: { in: targetActive } },
                orderBy: { date: "desc" },
                select: orderSelect
            }) : Promise.resolve([]);

            terminalOrdersPromise = targetTerminal.length > 0 ? db.order.findMany({
                where: { status: { in: targetTerminal } },
                orderBy: { date: "desc" },
                take: 400,
                select: orderSelect
            }) : Promise.resolve([]);
        }

        const [activeOrders, terminalOrders] = await Promise.all([activeOrdersPromise, terminalOrdersPromise]);
        const orders = [...activeOrders, ...terminalOrders];

        const serialized = orders.map(order => ({
            hasCargoPdf: !!order.cargoLabelPdf,
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
