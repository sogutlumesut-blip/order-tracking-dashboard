import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { parseUserPermissions } from "@/lib/permissions";
import { getSearchVariants } from "@/lib/search-utils";

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
            hasCargoPdf: true,
            cargoLabelPdf: true,
            externalId: true,
            source: true,
            items: {
                select: {
                    id: true,
                    name: true,
                    sku: true,
                    url: true,
                    quantity: true,
                    material: true,
                    dimensions: true,
                    productNote: true,
                    sampleData: true,
                    croppedImage: true,
                    orderId: true
                }
            },
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

        let orders: any[] = [];

        if (search) {
            const cleanSearch = search.trim();
            const tokens = cleanSearch.split(/\s+/).filter(Boolean);
            const cleanId = cleanSearch.replace(/^[#\s]+/, "");
            const digits = cleanSearch.replace(/\D/g, "");

            const fullVariants = getSearchVariants(cleanSearch);

            const searchFilterOR: any[] = [
                ...fullVariants.flatMap(v => [
                    { customer: { contains: v, mode: 'insensitive' as const } },
                    { customer: { contains: v } }
                ]),
                { phone: { contains: cleanSearch } },
                { email: { contains: cleanSearch, mode: 'insensitive' as const } },
                { barcode: { contains: cleanSearch, mode: 'insensitive' as const } },
                { trackingNumber: { contains: cleanSearch, mode: 'insensitive' as const } },
                { cargoTrackingNumber: { contains: cleanSearch, mode: 'insensitive' as const } },
                { externalId: { contains: cleanSearch, mode: 'insensitive' as const } },
                { note: { contains: cleanSearch, mode: 'insensitive' as const } },
            ];

            const numericCleanId = Number(cleanId);
            if (!isNaN(numericCleanId) && cleanId.length > 0) {
                // In PostgreSQL, id is INT4 (max 2,147,483,647). Values above cause Prisma runtime overflow error.
                if (numericCleanId > 0 && numericCleanId <= 2147483647) {
                    searchFilterOR.push({ id: numericCleanId });
                }
                searchFilterOR.push({ externalId: `pm_${cleanId}` });
                searchFilterOR.push({ externalId: { contains: cleanId, mode: 'insensitive' as const } });
            }

            if (digits.length >= 3) {
                searchFilterOR.push({ phone: { contains: digits } });
            }

            // Multi-word customer match: customer contains every token
            if (tokens.length > 1) {
                searchFilterOR.push({
                    AND: tokens.map(token => ({
                        OR: getSearchVariants(token).flatMap(v => [
                            { customer: { contains: v, mode: 'insensitive' as const } },
                            { customer: { contains: v } }
                        ])
                    }))
                });
            }

            // Also check items (product name or sku) for any token
            tokens.forEach(token => {
                const itemVariants = getSearchVariants(token);
                searchFilterOR.push({
                    items: {
                        some: {
                            OR: itemVariants.flatMap(v => [
                                { name: { contains: v, mode: 'insensitive' as const } },
                                { sku: { contains: v, mode: 'insensitive' as const } }
                            ])
                        }
                    }
                });
            });

            const searchWhere: any = {
                OR: searchFilterOR
            };

            if (!isAdmin) {
                searchWhere.status = { in: permissions.view };
            }

            try {
                orders = await db.order.findMany({
                    where: searchWhere,
                    orderBy: [{ updatedAt: "desc" }, { date: "desc" }, { id: "desc" }],
                    take: 500,
                    select: orderSelect
                });
            } catch (e) {
                console.error("API orders search error:", e);
                orders = [];
            }
        } else {
            let activeOrders: any[] = [];
            let terminalOrders: any[] = [];

            if (targetActive.length > 0) {
                try {
                    activeOrders = await db.order.findMany({
                        where: { status: { in: targetActive } },
                        orderBy: [{ updatedAt: "desc" }, { date: "desc" }, { id: "desc" }],
                        select: orderSelect
                    });
                } catch (e) {
                    console.error("API activeOrders error, retrying once...", e);
                    await new Promise(r => setTimeout(r, 600));
                    activeOrders = await db.order.findMany({
                        where: { status: { in: targetActive } },
                        orderBy: [{ updatedAt: "desc" }, { date: "desc" }, { id: "desc" }],
                        select: orderSelect
                    });
                }
            }

            if (targetTerminal.length > 0) {
                try {
                    terminalOrders = await db.order.findMany({
                        where: { status: { in: targetTerminal } },
                        orderBy: [{ updatedAt: "desc" }, { date: "desc" }, { id: "desc" }],
                        take: 400,
                        select: orderSelect
                    });
                } catch (e) {
                    console.error("API terminalOrders non-critical error:", e);
                    terminalOrders = [];
                }
            }

            const orderMap = new Map<number, any>();
            for (const o of [...activeOrders, ...terminalOrders]) {
                if (!orderMap.has(o.id)) {
                    orderMap.set(o.id, o);
                } else {
                    const existing = orderMap.get(o.id);
                    const existingTime = new Date(existing.updatedAt || existing.date || 0).getTime();
                    const currentTime = new Date(o.updatedAt || o.date || 0).getTime();
                    if (currentTime >= existingTime) {
                        orderMap.set(o.id, o);
                    }
                }
            }
            orders = Array.from(orderMap.values());
        }

        // Genel güvenlik önlemi: Tekrarlayan sipariş ID'lerini tekilleştir
        if (orders.length > 1) {
            const uniqueMap = new Map<number, any>();
            for (const o of orders) {
                if (!uniqueMap.has(o.id)) {
                    uniqueMap.set(o.id, o);
                } else {
                    const existing = uniqueMap.get(o.id);
                    const existingTime = new Date(existing.updatedAt || existing.date || 0).getTime();
                    const currentTime = new Date(o.updatedAt || o.date || 0).getTime();
                    if (currentTime >= existingTime) {
                        uniqueMap.set(o.id, o);
                    }
                }
            }
            orders = Array.from(uniqueMap.values());
        }
        const returnedOrderIds = orders.map(o => o.id);

        const itemImageMap = new Map<number, string>();
        if (returnedOrderIds.length > 0) {
            try {
                const itemImages = await db.$queryRaw<Array<{ id: number, image_src: string | null }>>`
                    SELECT id, 
                      CASE 
                        WHEN image_src LIKE 'data:image%' THEN '/api/order-image/' || id
                        WHEN image_src LIKE '%|data:image%' THEN '/api/order-image/' || id
                        WHEN image_src LIKE '/uploads/%' THEN 'https://printmarkt.co' || image_src
                        WHEN image_src LIKE 'uploads/%' THEN 'https://printmarkt.co/' || image_src
                        WHEN length(image_src) > 500 THEN '/api/order-image/' || id
                        ELSE image_src 
                      END AS image_src
                    FROM "OrderItem"
                    WHERE "orderId" IN (${Prisma.join(returnedOrderIds)})
                `;
                for (const img of itemImages) {
                    if (img.image_src) itemImageMap.set(img.id, img.image_src);
                }
            } catch (err) {
                console.error("Non-critical error fetching item images in API:", err);
            }
        }

        const serialized = orders.map((order: any) => ({
            ...order,
            hasCargoPdf: !!(order.hasCargoPdf || order.cargoLabelPdf),
            date: order.date.toISOString(),
            createdAt: order.createdAt.toISOString(),
            updatedAt: order.updatedAt.toISOString(),
            total: order.total || "0 ₺",
            items: (order.items || []).map((item: any) => ({
                ...item,
                sku: item.sku || null,
                image_src: itemImageMap.get(item.id) || null,
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
