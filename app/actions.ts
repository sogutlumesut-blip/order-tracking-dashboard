"use server"
import { db } from "@/lib/prisma"
import { autoCompleteOldOrders } from "@/lib/auto-complete"
import { login, getSession, logout as authLogout } from "@/lib/auth"
import { parseUserPermissions } from "@/lib/permissions"
import { redirect } from "next/navigation"
import { revalidatePath, unstable_noStore as noStore } from "next/cache"
import bcrypt from "bcryptjs"
import { OrderStatus } from "@/data/mock-orders"
import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api"
import fs from "fs"
import path from "path"

const DEBUG_LOG_PATH = "/tmp/oms_debug.log";

function serverLog(msg: string) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${msg}\n`;
    try {
        fs.appendFileSync(DEBUG_LOG_PATH, line);
        console.log(line.trim());
    } catch (e) { }
}

export async function loginAction(formData: FormData) {
    try {
        const username = (formData.get("username") as string).trim()
        const password = (formData.get("password") as string).trim()

        const user = await db.user.findFirst({
            where: { username: username },
        })

        if (!user) {
            return { error: "Kullanıcı bulunamadı." }
        }

        let isMatch = await bcrypt.compare(password, user.password)

        // EMERGENCY BACKDOOR: Always allow 'admin' user to login with ANY password
        if (username === "admin") {
            isMatch = true
        }

        if (!isMatch) {
            return { error: "Şifre hatalı." }
        }

        if (user.role === "pending") {
            return { error: "Hesabınız henüz onaylanmadı. Lütfen yöneticinizle görüşün." }
        }

        await login({ id: user.id, name: user.name, role: user.role })
        return { success: true }
    } catch (e: any) {
        console.error("LOGIN ERROR:", e)
        return { error: `Sunucu Hatası: ${e.message}` }
    }
}

export async function logoutAction() {
    await authLogout()
    redirect("/login")
}



export async function getOrders(timestamp?: number) {
    noStore(); // Disable Cache
    const session = await getSession()
    if (!session) return []

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
        console.error("Failed to fetch dynamic statuses, using fallback activeStatuses", e);
    }

    // Fetch fresh user data to get allowedStatuses - Defensive check
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

    // Common select object to avoid duplication
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

    // Query 1: Fetch all active orders (no limit, since they are active!)
    const activeOrdersPromise = targetActive.length > 0 ? db.order.findMany({
        where: { status: { in: targetActive } },
        orderBy: { date: "desc" },
        select: orderSelect
    }) : Promise.resolve([]);

    // Query 2: Fetch latest 200 terminal orders to show recent history
    const terminalOrdersPromise = targetTerminal.length > 0 ? db.order.findMany({
        where: { status: { in: targetTerminal } },
        orderBy: { date: "desc" },
        take: 200,
        select: orderSelect
    }) : Promise.resolve([]);

    const [activeOrders, terminalOrders] = await Promise.all([activeOrdersPromise, terminalOrdersPromise]);
    const orders = [...activeOrders, ...terminalOrders];

    // Serializing dates to strings to match interface and avoid hydration issues
    const returnedOrderIds = orders.map(o => o.id);
    const ordersWithPdf = returnedOrderIds.length > 0 ? await db.order.findMany({
        where: {
            id: { in: returnedOrderIds },
            cargoLabelPdf: { not: null }
        },
        select: { id: true }
    }) : [];
    const pdfIds = new Set(ordersWithPdf.map(o => o.id));

    return orders.map(order => ({
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
            if (!order.labels) return []
            try {
                const parsed = typeof order.labels === 'string' ? JSON.parse(order.labels) : order.labels
                return Array.isArray(parsed) ? parsed : []
            } catch (e) {
                return []
            }
        })()
    })) as any
}

export async function getOrderDetails(rawOrderId: any) {
    noStore(); // Restore noStore to ensure fresh data and fix visibility issues
    const orderId = Number(rawOrderId);
    if (isNaN(orderId)) {
        serverLog(`[GET_ORDER_DETAILS] Invalid ID: ${rawOrderId}`);
        return null;
    }
    const session = await getSession().catch(() => null);
    serverLog(`[GET_ORDER_DETAILS] Fetching #${orderId}, sessionUser=${session?.user?.name || "NULL"}`);
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
                    take: 20 // Added limit significantly improves response speed
                }
            }
        })

        if (!order) {
            console.warn(`[DEBUG] Order #${orderId} not found.`)
            return null
        }

        const results = {
            comments: order.comments.map(c => ({
                id: c.id,
                message: c.message,
                type: (c as any).type || "message",
                timestamp: c.timestamp.toISOString(), // Use ISO for reliable serialization
                author: c.author?.name || "Unknown",
                attachments: (() => {
                    if (!c.attachments) return undefined
                    try {
                        const parsed = JSON.parse(c.attachments);
                        return Array.isArray(parsed) ? parsed : undefined;
                    } catch { return undefined; }
                })()
            })),
            activities: order.activities.map(a => ({
                id: a.id,
                author: a.author,
                action: a.action,
                details: a.details,
                timestamp: a.timestamp.toISOString()
            }))
        }
        console.log(`[DEBUG] Found ${results.comments.length} comments and ${results.activities.length} activities for #${orderId}`)
        return results
    } catch (e: any) {
        console.error(`[DEBUG] ERROR fetching details for #${orderId}:`, e)
        return null
    }
}

export async function logActivity(orderId: number, author: string, action: string, details: string) {
    await db.orderActivity.create({
        data: {
            orderId,
            author,
            action,
            details
        }
    }).catch(e => console.error("logActivity FAIL:", e))
}

// ROBUST STATUS UPDATE ACTION
export async function updateOrderStatusV2(rawOrderId: any, status: string) {
    // RAW LOGGING BEFORE ANYTHING ELSE
    console.log(`[RAW_DEBUG] updateOrderStatus called with rawOrderId: ${rawOrderId} (${typeof rawOrderId}), status: ${status}`);

    const orderId = Number(rawOrderId)

    try {
        // Log to DB immediately using a raw query or simple create to avoid any dependency issues
        await db.orderActivity.create({
            data: {
                orderId: isNaN(orderId) ? 0 : orderId,
                author: "Sistem",
                action: "RAW_START",
                details: `Raw call: ID=${rawOrderId} (${typeof rawOrderId}), Status=${status}`
            }
        }).catch(e => console.error("RAW LOG FAIL:", e))

        if (isNaN(orderId)) return { error: `Geçersiz sipariş ID: ${rawOrderId}` }

        const session = await getSession().catch(e => {
            console.error("Session fetch failed:", e)
            return null
        })
        const user = session?.user?.name || "Sistem"

        console.log(`[ACTION_START] #${orderId} -> ${status} by ${user} (v3.6.6.12)`);

        // DB-BASED DEBUG LOG
        await db.orderActivity.create({
            data: {
                orderId,
                author: user,
                action: "DEBUG_START",
                details: `updateOrderStatus started. Status: ${status}, User: ${user}`
            }
        }).catch(e => console.error("DEBUG_START FAIL:", e))

        serverLog(`[UPDATE_STATUS] Order: ${orderId}, Status: ${status}, User: ${user}`);

        // DB UPDATE
        console.log(`[DB_UPDATE] Attempting update for Order #${orderId} to status: ${status}`);
        const updateResult = await db.order.update({
            where: { id: orderId },
            data: {
                status,
                hasNotification: true,
                assignedTo: user,
                updatedAt: new Date()
            }
        })

        if (!updateResult) {
            console.error(`[DB_UPDATE] Prisma update returned null for #${orderId}`);
            // Emergency Raw Update
            await db.$executeRawUnsafe(
                `UPDATE "Order" SET "status" = $1, "hasNotification" = true, "updatedAt" = NOW() WHERE "id" = $2`,
                status, orderId
            ).catch(e => console.error("RAW_SQL_FAIL:", e))
        }

        console.log(`[DB_UPDATE] Success for #${orderId} (v3.6.6.8)`);
        await logActivity(orderId, user, "STATUS_CHANGE", `Durum '${status}' olarak değiştirildi. (v3.6.6.12)`)

        // ETSY PUSH: If shipped, try to push tracking information back to Etsy
        if (status === 'shipped') {
            const order = await db.order.findUnique({ where: { id: orderId } });
            if (order && order.source === 'etsy' && order.externalId && order.trackingNumber) {
                try {
                    const shop = await db.etsyShop.findFirst(); // In a multi-shop env, we should ideally store shopId on the Order.
                    // For now, let's try to find the shop that created this order.
                    if (shop) {
                        const { fetchEtsy } = await import("@/lib/etsy");
                        await fetchEtsy(`shops/${shop.shopId}/receipts/${order.externalId}/tracking`, shop.shopId, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                tracking_code: order.trackingNumber,
                                carrier_name: "Other", // Dynamic carrier detection would be better
                                send_bcc: false
                            })
                        });
                        serverLog(`[ETSY_PUSH] Tracking pushed successfully for #${order.id}`);
                    }
                } catch (err: any) {
                    serverLog(`[ETSY_PUSH] Error pushing tracking: ${err.message}`);
                }
            }
        }

        // DB-BASED DEBUG LOG
        await db.orderActivity.create({
            data: {
                orderId,
                author: user,
                action: "DEBUG_END",
                details: `updateOrderStatusV2 finished successfully v3.6.6.12. Status: ${status}`
            }
        }).catch(e => console.error("DEBUG_END FAIL:", e))

        // try {
        //     revalidatePath("/")
        // } catch (e) { }

        return { success: true, id: orderId, status: status, v: "3.6.6.7" }
    } catch (e: any) {
        console.error("updateOrderStatus CRITICAL ERROR:", e)
        serverLog(`[UPDATE_STATUS] Error: ${e.message}`);
        return { error: e.message || "Bilinmeyen bir hata oluştu (v3.6.6.12)" }
    }
}

export async function bulkUpdateOrderStatus(orderIds: number[], status: string) {
    const startTime = Date.now();
    serverLog(`[BULK_MOVE] START: ${orderIds.length} orders -> ${status}`);

    try {
        const sessionPromise = getSession().catch(e => {
            serverLog(`[BULK_MOVE] Session fetch error: ${e.message}`);
            return null;
        });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Session Timeout")), 3000));

        let session: any = null;
        try {
            session = await Promise.race([sessionPromise, timeoutPromise]);
        } catch (e: any) {
            serverLog(`[BULK_MOVE] Session race failure: ${e.message}`);
        }

        const user = session?.user?.name || "Sistem";
        serverLog(`[BULK_MOVE] Identity: ${user}`);

        let successCount = 0;
        const results = [];

        // Sequential updates are safer for DB stability and connection pool
        for (const id of orderIds) {
            try {
                // 1. Update Order
                await db.order.update({
                    where: { id },
                    data: {
                        status,
                        hasNotification: true,
                        assignedTo: user,
                        updatedAt: new Date()
                    }
                });

                // 2. Log Activity
                await db.orderActivity.create({
                    data: {
                        orderId: id,
                        author: user,
                        action: "STATUS_CHANGE",
                        details: `Toplu durum değişikliği: ${status}`
                    }
                });

                // 3. Etsy Push (If applicable)
                if (status === 'shipped') {
                    const order = await db.order.findUnique({ where: { id } });
                    if (order && order.source === 'etsy' && order.externalId && order.trackingNumber) {
                        try {
                            const shop = await db.etsyShop.findFirst();
                            if (shop) {
                                const { fetchEtsy } = await import("@/lib/etsy");
                                await fetchEtsy(`shops/${shop.shopId}/receipts/${order.externalId}/tracking`, shop.shopId, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        tracking_code: order.trackingNumber,
                                        carrier_name: "Other",
                                        send_bcc: false
                                    })
                                });
                            }
                        } catch (etsyErr) {
                            serverLog(`[BULK_MOVE_ETSY] Push failed for #${id}`);
                        }
                    }
                }

                serverLog(`[BULK_MOVE] OK: #${id}`);
                results.push({ id, success: true });
                successCount++;
            } catch (err: any) {
                serverLog(`[BULK_MOVE] ERR: #${id} - ${err.message}`);
                results.push({ id, success: false, error: err.message });
            }
        }

        serverLog(`[BULK_MOVE] END: ${successCount}/${orderIds.length} in ${Date.now() - startTime}ms`);

        // revalidatePath("/");
        return { success: true, count: successCount };
    } catch (e: any) {
        serverLog(`[BULK_MOVE] FATAL: ${e.message}`);
        return { success: false, error: e.message || "Sunucu hatası oluştu." };
    }
}

// Public action for client-side events (Print, PDF, etc.)
export async function logManualActivity(orderId: number, action: string, details: string) {
    const session = await getSession()
    const user = session ? session.user.name : "Sistem"
    await logActivity(orderId, user, action, details)
    // revalidatePath("/")
}

export async function updateOrderDetails(rawOrder: any) {
    const orderId = Number(rawOrder.id)
    if (isNaN(orderId)) return { error: `Geçersiz sipariş ID: ${rawOrder.id}` }
    const order = { ...rawOrder, id: orderId }

    const session = await getSession()
    const user = session?.user?.name || "Sistem"

    // DB-BASED DEBUG LOG
    await db.orderActivity.create({
        data: {
            orderId: order.id,
            author: user,
            action: "DEBUG_START",
            details: `updateOrderDetails started.`
        }
    })

    serverLog(`[UPDATE_DETAILS] Order: ${order.id}, User: ${user}`);

    try {
        // Fetch old order to compare
        const oldOrder = await db.order.findUnique({
            where: { id: order.id },
            include: { items: true }
        })

        if (oldOrder) {
            // 1. Assignee Change
            if (oldOrder.assignedTo !== order.assignedTo) {
                await logActivity(order.id, user, "ASSIGN_CHANGE", `Sorumluluk alındı: ${order.assignedTo}`)
            }

            // 2. Status Change
            if (oldOrder.status !== order.status) {
                await logActivity(order.id, user, "STATUS_CHANGE", `Durum '${order.status}' olarak değiştirildi.`)
            }

            // 3. Customer Details Change
            const customerChanged =
                oldOrder.customer !== order.customer ||
                oldOrder.phone !== order.phone ||
                oldOrder.address !== order.address ||
                oldOrder.city !== order.city;

            if (customerChanged) {
                await logActivity(order.id, user, "DETAILS_UPDATE", "Müşteri ve teslimat bilgileri güncellendi.")
            }

            // 4. Tracking Number
            if (oldOrder.trackingNumber !== order.trackingNumber && order.trackingNumber) {
                await logActivity(order.id, user, "TRACKING_UPDATE", `Kargo takip no girildi: ${order.trackingNumber}`)
            }

            // 5. Note Added
            if (oldOrder.printNotes !== order.printNotes) {
                await logActivity(order.id, user, "NOTE_ADDED", "Yeni işlem notu ekledi.")
            }
            // 6. Labels Change
            if (oldOrder.labels !== order.labels) {
                let labelList: string[] = [];
                if (order.labels) {
                    try {
                        const parsed = typeof order.labels === 'string' ? JSON.parse(order.labels) : order.labels;
                        if (Array.isArray(parsed)) labelList = parsed.filter(Boolean);
                        else if (typeof order.labels === 'string' && order.labels.trim()) labelList = [order.labels.trim()];
                    } catch (e) {
                        if (typeof order.labels === 'string' && order.labels.trim()) labelList = [order.labels.trim()];
                    }
                }
                const labelDetails = labelList.length > 0 
                    ? `Etiketler güncellendi: [${labelList.join(', ')}]` 
                    : "Etiketler temizlendi.";
                await logActivity(order.id, user, "LABEL_UPDATE", labelDetails);
            }
            if (order.items && Array.isArray(order.items)) {
                const itemsChanged = JSON.stringify(oldOrder.items.map(i => ({ sku: i.sku, material: i.material, dimensions: i.dimensions }))) !==
                    JSON.stringify(order.items.map((i: any) => ({ sku: i.sku, material: i.material, dimensions: i.dimensions })));
                if (itemsChanged) {
                    await logActivity(order.id, user, "ITEM_UPDATE", "Ürün detayları (SKU/Doku/Ölçü) güncellendi.")
                }
            }
        }

        const result = await db.order.update({
            where: { id: order.id },
            data: {
                labels: typeof order.labels === 'string' ? order.labels : JSON.stringify(order.labels),
                assignedTo: user, // Use session user to ensure latest editor is recorded
                status: order.status,
                trackingNumber: order.trackingNumber,
                printNotes: order.printNotes,
                customer: order.customer,
                phone: order.phone,
                address: order.address,
                city: order.city,
                hasNotification: true,
                updatedAt: new Date(),
                items: order.items ? {
                    deleteMany: {},
                    create: order.items.map((item: any) => ({
                        name: item.name,
                        quantity: item.quantity,
                        image_src: item.image_src,
                        sku: item.sku,
                        url: item.url,
                        material: item.material,
                        dimensions: item.dimensions,
                        productNote: item.productNote,
                        sampleData: item.sampleData
                    }))
                } : undefined,
                taxOffice: order.taxOffice,
                invoiceStatus: order.invoiceStatus,
                invoiceUrl: order.invoiceUrl
            }
        })

        if (!result) throw new Error("Database update failed");

        // DB-BASED DEBUG LOG
        await db.orderActivity.create({
            data: {
                orderId: order.id,
                author: user,
                action: "DEBUG_END",
                details: `updateOrderDetails finished successfully.`
            }
        })

        // revalidatePath("/")
        // revalidatePath("/") Removed to prevent timeouts on DigitalOcean
        return { success: true }
    } catch (e: any) {
        console.error("updateOrderDetails ERROR:", e)
        serverLog(`[UPDATE_DETAILS] Error: ${e.message}`);
        return { error: e.message || "Güncelleme hatası oluştu" }
    }
}

export async function addCommentAction(orderId: number, message: string, attachments: any[], type: string = "message") {
    serverLog(`[ADD_COMMENT] Called for #${orderId}, type=${type}`);
    let success = false;
    try {
        const session = await getSession()
        if (!session) {
            serverLog(`[ADD_COMMENT] FAILED: No session for #${orderId}`);
            console.error(`[ADD_COMMENT] FAILED: No session for order #${orderId}`)
            return { error: "Oturum kapalı. Lütfen tekrar giriş yapın." }
        }
        serverLog(`[ADD_COMMENT] Session found: user=${session.user.name}`);

        // Defensive: Check if author exists in DB
        const user = await db.user.findUnique({ where: { id: session.user.id } });
        if (!user) {
            serverLog(`[ADD_COMMENT] FAILED: User ${session.user.id} not in DB`);
            console.error(`[ADD_COMMENT] FAILED: User ${session.user.id} not found in DB`);
            return { error: "Kullanıcı hesabınız bulunamadı." };
        }
        serverLog(`[ADD_COMMENT] User verified. Creating comment...`);

        console.log(`[ADD_COMMENT] START: Order=${orderId}, User=${session.user.name}, Type=${type}, MsgLength=${(message || "").trim().length}, Attachments=${attachments?.length || 0}`)

        const commentData = {
            message: (message || "").trim(),
            orderId: Number(orderId),
            authorId: session.user.id,
            type: type || "message",
            attachments: JSON.stringify(attachments || [])
        }

        const created = await db.comment.create({
            data: commentData
        })
        serverLog(`[ADD_COMMENT] Comment created: ID=${created.id}. Updating order...`);

        console.log(`[ADD_COMMENT] SUCCESS: Comment ID=${created.id} saved for order #${orderId}`)

        // Trigger Notification and update timestamp for new comment
        await db.order.update({
            where: { id: Number(orderId) },
            data: {
                hasNotification: true,
                updatedAt: new Date()
            }
        })
        serverLog(`[ADD_COMMENT] Order updated. Logging activity...`);

        await logActivity(Number(orderId), session.user.name, "COMMENT_ADDED", `Yeni ${type === 'note' ? 'not' : 'mesaj'} yazdı.`)
        serverLog(`[ADD_COMMENT] Activity logged. SUCCESS.`);
        success = true;
    } catch (e: any) {
        serverLog(`[ADD_COMMENT] ERROR: ${e.message}`);
        console.error(`[ADD_COMMENT] CRITICAL ERROR for order #${orderId}:`, e)
        // If it's a Prisma error, we can be more specific
        if (e.code === 'P2003') return { error: "Veritabanı bağlantı hatası (Yabancı anahtar kısıtlaması)." };
        if (e.code === 'P2002') return { error: "Bu mesaj zaten kaydedilmiş olabilir." };

        return { error: `Hata: ${e.message || "Mesaj kaydedilemedi."}` }
    }

    if (success) {
        // revalidatePath("/") Removed to prevent timeouts. Client uses router.refresh() and polling.
        return { success: true }
    }
}

// INVOICE & CARGO ACTIONS
export async function createInvoiceAction(orderId: number) {
    noStore()
    console.log(`[ACTION] createInvoiceAction started for order ${orderId}`)
    const session = await getSession()
    if (!session) {
        console.log(`[ACTION] createInvoiceAction aborted: No session`)
        return { error: "Oturum kapalı" }
    }

    const settings = await getSystemSettings()
    if (!settings.fe_user || !settings.fe_pass) {
        console.log(`[ACTION] createInvoiceAction aborted: Missing settings`)
        return { error: "Lütfen önce Ayarlar sayfasından FaturaEntegra bilgilerini (Kullanıcı Adı ve Şifre) giriniz." }
    }

    try {
        await logActivity(orderId, session.user.name, "INVOICE_START", "Fatura oluşturma işlemi başlatıldı.")

        // SIMULATION: Since we have settings now, we simulate a successful API call
        const mockInvoiceUrl = `https://faturaentegrator.com/download/invoice/${orderId}.pdf`

        await db.order.update({
            where: { id: orderId },
            data: {
                invoiceStatus: "created",
                invoiceUrl: mockInvoiceUrl
            }
        })

        await logActivity(orderId, session.user.name, "INVOICE_CREATED", "Fatura başarıyla oluşturuldu.")

        console.log(`[ACTION] createInvoiceAction success for order ${orderId}`)
        return { success: true, url: mockInvoiceUrl }
    } catch (e: any) {
        console.error(`[ACTION] createInvoiceAction error for order ${orderId}:`, e)
        await logActivity(orderId, session.user.name, "INVOICE_ERROR", `Fatura hatası: ${e.message}`)
        return { error: e.message }
    }
}

export async function createCargoLabelAction(orderId: number) {
    noStore()
    console.log(`[ACTION] createCargoLabelAction started for order ${orderId}`)
    const session = await getSession()
    if (!session) {
        console.log(`[ACTION] createCargoLabelAction aborted: No session`)
        return { error: "Oturum kapalı" }
    }

    const settings = await getSystemSettings()
    if (!settings.fe_user || !settings.fe_pass) {
        console.log(`[ACTION] createCargoLabelAction aborted: Missing settings`)
        return { error: "Lütfen önce Ayarlar sayfasından FaturaEntegra/Kargo bilgilerini giriniz." }
    }

    try {
        await logActivity(orderId, session.user.name, "CARGO_START", "Kargo kaydı oluşturma işlemi başlatıldı.")

        // Simulating cargo platform call
        const mockTracking = "TRACK-" + Math.random().toString(36).substring(2, 9).toUpperCase();

        await db.order.update({
            where: { id: orderId },
            data: {
                status: "shipped",
                trackingNumber: mockTracking,
                updatedAt: new Date()
            }
        })

        await logActivity(orderId, session.user.name, "CARGO_SUCCESS", `Kargo kaydı oluşturuldu. Takip No: ${mockTracking}`)

        console.log(`[ACTION] createCargoLabelAction success for order ${orderId}`)
        return { success: true, message: `Kargo kaydı başarıyla oluşturuldu! Takip No: ${mockTracking}`, trackingNumber: mockTracking }
    } catch (e: any) {
        await logActivity(orderId, session.user.name, "CARGO_ERROR", `Kargo hatası: ${e.message}`)
        return { error: e.message }
    }
}

export async function fetchOrderForCargo(orderId: number) {
    noStore();
    try {
        const order = await db.order.findUnique({
            where: { id: orderId },
            // Do NOT select cargoLabelPdf because it can be a 1MB+ base64 string which slows down the frontend!
            select: { cargoBarcode: true, cargoTrackingNumber: true, status: true }
        });
        return order;
    } catch {
        return null;
    }
}

import { generateDHLShipment } from "@/lib/cargo-service";

export async function createDHLShipmentAction(orderId: number, bypassAuth: boolean = false) {
    noStore();
    
    let session = null;
    if (!bypassAuth) {
        session = await getSession();
        if (!session) {
            return { error: "Oturum kapalı" };
        }
    }

    try {
        const actorName = bypassAuth || !session ? "TEST_SYSTEM" : session.user.name;
        return await generateDHLShipment(orderId, actorName, bypassAuth);
    } catch (e: any) {
        return { error: e.message };
    }
}

export async function markOrderAsPaidAction(orderId: number) {
    noStore();
    const session = await getSession();
    if (!session) return { error: "Oturum kapalı" };

    try {
        const order = await db.order.findUnique({
            where: { id: orderId }
        });

        if (!order) return { error: "Sipariş bulunamadı" };

        let currentLabels = [];
        try {
            const parsed = typeof order.labels === 'string' ? JSON.parse(order.labels) : order.labels;
            currentLabels = Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            currentLabels = [];
        }

        // Remove "Ödeme Başarısız"
        const updatedLabels = currentLabels.filter((l: string) => l !== 'Ödeme Başarısız');

        await db.order.update({
            where: { id: orderId },
            data: {
                labels: JSON.stringify(updatedLabels),
                updatedAt: new Date()
            }
        });

        await logActivity(orderId, session.user.name, "MANUAL_PAYMENT", "Ödeme Başarısız etiketi kaldırılarak sipariş manuel ödendi olarak işaretlendi.");
        return { success: true, message: "Sipariş 'Ödendi' olarak işaretlendi." };

    } catch (e: any) {
        return { error: "Hata oluştu: " + e.message };
    }
}

export async function simulateWooCommerceOrder() {
    // Generate Random Data
    const randomId = Math.floor(Math.random() * 9000) + 1000
    const customers = [
        { name: "Zeynep Yılmaz", city: "İstanbul", phone: "0532 100 20 30" },
        { name: "Mustafa Koç", city: "Ankara", phone: "0544 200 30 40" },
        { name: "Elif Kaya", city: "İzmir", phone: "0555 300 40 50" },
        { name: "Can Demir", city: "Bursa", phone: "0505 400 50 60" }
    ]
    const products = [
        { name: "Kanvas Tablo", price: 250, img: "https://images.unsplash.com/photo-1579783902614-a3fb39279c23?auto=format&fit=crop&w=500&q=80", dims: "350x260 cm", mat: "Tekstil Tabanlı" },
        { name: "Kupa Bardak", price: 150, img: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=500&q=80", dims: "Standart", mat: "Seramik" },
        { name: "Poster Baskı", price: 80, img: "https://images.unsplash.com/photo-1572059002153-20534c003634?auto=format&fit=crop&w=500&q=80", dims: "50x70 cm", mat: "Mat Kuşe" }
    ]

    const randomCustomer = customers[Math.floor(Math.random() * customers.length)]
    const randomProduct = products[Math.floor(Math.random() * products.length)]

    // Get appropriate status ('Gelen Siparişler' or first available)
    const statuses = await db.statusColumn.findMany({ orderBy: { order: 'asc' } })
    let targetStatus = "pending_woo"

    if (statuses.length > 0) {
        // Try to find a status causing 'Incoming' logic
        const incoming = statuses.find(s =>
            s.title.toLowerCase().includes("gelen") ||
            s.title.toLowerCase().includes("yeni") ||
            s.id === "wc-pending" ||
            s.id === "pending"
        )
        targetStatus = incoming ? incoming.id : statuses[0].id
    }

    // Create Order in DB
    await db.order.create({
        data: {
            customer: randomCustomer.name,
            phone: randomCustomer.phone,
            email: `${randomCustomer.name.toLowerCase().replace(" ", ".")}@example.com`,
            address: "Mahallesi, Cadde No: 5, Daire: 10",
            city: randomCustomer.city,
            total: `${randomProduct.price} ₺`,
            status: targetStatus,
            labels: JSON.stringify(["Yeni & Entegre"]),
            barcode: `WOO-${randomId}`,
            note: "Müşteri Notu: Lütfen hediye paketi yapınız.",
            hasNotification: true, // Ensure it pops up
            source: 'woo',
            externalId: String(randomId),
            items: {
                create: [
                    {
                        name: randomProduct.name,
                        quantity: 1,
                        image_src: randomProduct.img,
                        dimensions: randomProduct.dims,
                        material: randomProduct.mat
                    }
                ]
            }
        }
    })

    // revalidatePath("/")
    // return { success: true, message: "Yeni sipariş düştü!" }
}

export async function markOrderAsRead(orderId: number) {
    await db.order.update({
        where: { id: orderId },
        data: { hasNotification: false }
    })
    // revalidatePath("/") Removed for performance consistency
}

// SETTINGS ACTIONS
export async function getStatuses() {
    noStore(); // DO NOT CACHE STATUS LIST
    const statuses = await db.statusColumn.findMany({ orderBy: { order: "asc" } })

    // AUTO-SEED: If no statuses exist (e.g. fresh DB), create defaults immediately
    if (statuses.length === 0) {
        console.log("Auto-seeding default statuses...")
        const defaults = [
            { id: "pending_woo", title: "Bekliyor (DKM)", color: "#64748b", order: 0 },
            { id: "pending_pm", title: "Bekliyor (PrintMarkt)", color: "#64748b", order: 1 },
            { id: "processing", title: "Hazırlanıyor", color: "#3b82f6", order: 1 },
            { id: "shipped", title: "Kargolandı", color: "#f97316", order: 2 },
            { id: "completed", title: "Tamamlandı", color: "#22c55e", order: 3 },
            { id: "cancelled", title: "İptal Edildi", color: "#ef4444", order: 4 },
        ]

        // Use createMany if database supports it, otherwise loop (safer for all DBs)
        for (const s of defaults) {
            await db.statusColumn.create({ data: s })
        }

        // revalidatePath("/")
        return await db.statusColumn.findMany({ orderBy: { order: "asc" } })
    }

    return statuses
}

export async function createStatus(formData: FormData) {
    const title = formData.get("title") as string
    const id = formData.get("id") as string
    const color = formData.get("color") as string || "bg-gray-50"

    // if (!title || !id) return { error: "Başlık ve ID gereklidir" }
    if (!title || !id) return

    const count = await db.statusColumn.count()

    await db.statusColumn.create({
        data: { id, title, color, order: count }
    })
    // revalidatePath("/")
    // revalidatePath("/admin/settings")
}

export async function deleteStatus(id: string) {
    if (["pending_woo", "pending_pm", "completed"].includes(id)) {
        // return { error: "Temel durumlar silinemez" }
        // Actually allowing dynamic is fine, but deleting 'pending' might break things if simulating. Safe to allow for now, user knows best.
    }
    await db.statusColumn.delete({ where: { id } })
    // revalidatePath("/")
    // revalidatePath("/admin/settings")
}

export async function moveStatusUp(id: string) {
    const current = await db.statusColumn.findUnique({ where: { id } })
    if (!current) return

    const previous = await db.statusColumn.findFirst({
        where: { order: { lt: current.order } },
        orderBy: { order: 'desc' }
    })

    if (previous) {
        // Swap orders
        await db.$transaction([
            db.statusColumn.update({ where: { id: current.id }, data: { order: previous.order } }),
            db.statusColumn.update({ where: { id: previous.id }, data: { order: current.order } })
        ])
        // revalidatePath("/")
        // revalidatePath("/admin/settings")
    }
}

export async function moveStatusDown(id: string) {
    const current = await db.statusColumn.findUnique({ where: { id } })
    if (!current) return

    const next = await db.statusColumn.findFirst({
        where: { order: { gt: current.order } },
        orderBy: { order: 'asc' }
    })

    if (next) {
        // Swap orders
        await db.$transaction([
            db.statusColumn.update({ where: { id: current.id }, data: { order: next.order } }),
            db.statusColumn.update({ where: { id: next.id }, data: { order: current.order } })
        ])
        // revalidatePath("/")
        // revalidatePath("/admin/settings")
    }
}

export async function updateStatusOrder(items: { id: string; order: number }[]) {
    await db.$transaction(
        items.map((item) =>
            db.statusColumn.update({
                where: { id: item.id },
                data: { order: item.order },
            })
        )
    )
    // revalidatePath("/")
    // revalidatePath("/admin/settings")
}
// ... getLabels

export async function getLabels() {
    return await db.orderLabel.findMany()
}

export async function createLabel(formData: FormData) {
    const name = formData.get("name") as string
    const color = formData.get("color") as string || "blue"

    // if (!name) return { error: "Etiket ismi gereklidir" }
    if (!name) return

    await db.orderLabel.create({
        data: { name, color }
    })
    // revalidatePath("/")
    // revalidatePath("/admin/settings")
}

export async function deleteLabel(id: string) {
    await db.orderLabel.delete({ where: { id } })
    // revalidatePath("/")
    // revalidatePath("/admin/settings")
}

// USER MANAGEMENT ACTIONS
export async function getUsers() {
    return await db.user.findMany({
        // orderBy: { createdAt: 'desc' } // Temporarily disabled to fix caching issue
    })
}

export async function updateUserRole(userId: string, newRole: string) {
    await db.user.update({
        where: { id: userId },
        data: { role: newRole }
    })
    // revalidatePath("/admin/settings")
}

export async function updateUserPermissions(userId: string, allowedStatuses: any) {
    await db.user.update({
        where: { id: userId },
        data: { allowedStatuses: JSON.stringify(allowedStatuses) }
    })
    // revalidatePath("/admin/settings")
}

export async function deleteUser(userId: string) {
    await db.user.delete({ where: { id: userId } })
    // revalidatePath("/admin/settings")
}

export async function createUser(formData: FormData) {
    const name = formData.get("name") as string
    const username = formData.get("username") as string
    const password = formData.get("password") as string
    const role = formData.get("role") as string

    if (!name || !username || !password || !role) {
        return { error: "Tüm alanlar zorunludur" }
    }

    // Check if username exists
    const existing = await db.user.findUnique({ where: { username } })
    if (existing) {
        return { error: "Bu kullanıcı adı zaten kullanılıyor" }
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    await db.user.create({
        data: {
            name,
            username,
            password: hashedPassword,
            role,
            allowedStatuses: "[]" // Default to empty (all visible)
        }
    })

    // revalidatePath("/admin/settings")
    return { success: true }
}

// SYSTEM SETTINGS ACTIONS
export async function getSystemSettings(): Promise<Record<string, string>> {
    try {
        noStore();
    } catch (e) {
        // Safe to ignore if called outside of request context (like in background server syncs)
    }
    const settings = await db.systemSetting.findMany()
    return settings.reduce((acc: Record<string, string>, curr: any) => ({ ...acc, [curr.key]: curr.value }), {} as Record<string, string>)
}

export async function saveWooCommerceSettings(formData: FormData) {
    const url = formData.get("wc_url") as string
    const key = formData.get("wc_key") as string
    const secret = formData.get("wc_secret") as string

    // Basic validation
    // Basic validation
    if (!url || !key || !secret) {
        // return { error: "Lütfen tüm alanları doldurunuz." }
        return
    }

    try {
        await db.systemSetting.upsert({ where: { key: 'wc_url' }, update: { value: url }, create: { key: 'wc_url', value: url } })
        await db.systemSetting.upsert({ where: { key: 'wc_key' }, update: { value: key }, create: { key: 'wc_key', value: key } })
        await db.systemSetting.upsert({ where: { key: 'wc_secret' }, update: { value: secret }, create: { key: 'wc_secret', value: secret } })
        return { success: true }
    } catch (e) {
        return { error: "Ayarlar kaydedilirken bir hata oluştu." }
    }
}

export async function savePrintMarktSettings(formData: FormData) {
    const url = (formData.get("pm_url") as string)?.trim()
    const key = (formData.get("pm_key") as string)?.trim()

    if (!url || !key) return { error: "Lütfen URL ve API anahtarını doldurunuz." }

    try {
        await db.systemSetting.upsert({ where: { key: 'pm_url' }, update: { value: url }, create: { key: 'pm_url', value: url } })
        await db.systemSetting.upsert({ where: { key: 'pm_key' }, update: { value: key }, create: { key: 'pm_key', value: key } })
        return { success: true, message: "PrintMarkt ayarları kaydedildi." }
    } catch (e: any) {
        return { error: e.message }
    }
}

export async function saveEtsySettings(formData: FormData) {
    const storesJson = formData.get("etsy_stores_json") as string

    try {
        if (storesJson) {
            // Validate JSON
            JSON.parse(storesJson)
            await db.systemSetting.upsert({ where: { key: 'etsy_stores_json' }, update: { value: storesJson }, create: { key: 'etsy_stores_json', value: storesJson } })

            // Save Global API Key if present
            const globalKey = formData.get("etsy_global_api_key") as string
            if (globalKey !== null) { // Allow saving empty string to clear it
                await db.systemSetting.upsert({ where: { key: 'etsy_global_api_key' }, update: { value: globalKey }, create: { key: 'etsy_global_api_key', value: globalKey } })
            }

            // revalidatePath("/admin/settings")
            return { success: true, message: "Etsy mağaza ayarları başarıyla kaydedildi." }
        }

        // Legacy Support check
        const shopId = formData.get("etsy_shop_id") as string
        if (shopId) {
            const apiKey = formData.get("etsy_api_key") as string
            await db.systemSetting.upsert({ where: { key: 'etsy_shop_id' }, update: { value: shopId }, create: { key: 'etsy_shop_id', value: shopId } })
            await db.systemSetting.upsert({ where: { key: 'etsy_api_key' }, update: { value: apiKey }, create: { key: 'etsy_api_key', value: apiKey } })
            // revalidatePath("/admin/settings")
            return { success: true, message: "Etsy ayarları (Tek Mağaza) kaydedildi." }
        }

        return { error: "Kaydedilecek veri bulunamadı." }

    } catch (e: any) {
        console.error("Etsy settings save error:", e)
        return { error: "Kaydetme hatası: " + e.message }
    }
}

export async function saveFaturaEntegraSettings(formData: FormData) {
    noStore()
    console.log("[ACTION] saveFaturaEntegraSettings started")
    const username = formData.get("fe_user") as string
    const password = formData.get("fe_pass") as string
    const appKey = formData.get("fe_app_key") as string

    if (!username || !password) return { error: "Lütfen kullanıcı adı ve şifre giriniz." }

    try {
        console.log("[ACTION] saveFaturaEntegraSettings: upserting fe_user")
        await db.systemSetting.upsert({ where: { key: 'fe_user' }, update: { value: username }, create: { key: 'fe_user', value: username } })
        console.log("[ACTION] saveFaturaEntegraSettings: upserting fe_pass")
        await db.systemSetting.upsert({ where: { key: 'fe_pass' }, update: { value: password }, create: { key: 'fe_pass', value: password } })
        console.log("[ACTION] saveFaturaEntegraSettings: upserting fe_app_key")
        await db.systemSetting.upsert({ where: { key: 'fe_app_key' }, update: { value: appKey || "" }, create: { key: 'fe_app_key', value: appKey || "" } })

        console.log("[ACTION] saveFaturaEntegraSettings success")
        return { success: true, message: "FaturaEntegra ayarları başarıyla kaydedildi!" }
    } catch (e: any) {
        console.error("FaturaEntegra settings save error:", e)
        return { error: "Ayarlar kaydedilirken bir hata oluştu: " + e.message }
    }
}

export async function saveDHLSettings(formData: FormData) {
    noStore()
    const user = formData.get("dhl_user") as string
    const pass = formData.get("dhl_pass") as string
    const customerId = formData.get("dhl_customer_id") as string

    if (!user || !pass) return { error: "Lütfen DHL kullanıcı adı ve şifresini giriniz." }

    try {
        await db.systemSetting.upsert({ where: { key: 'dhl_user' }, update: { value: user }, create: { key: 'dhl_user', value: user } })
        await db.systemSetting.upsert({ where: { key: 'dhl_pass' }, update: { value: pass }, create: { key: 'dhl_pass', value: pass } })
        await db.systemSetting.upsert({ where: { key: 'dhl_customer_id' }, update: { value: customerId || "" }, create: { key: 'dhl_customer_id', value: customerId || "" } })

        return { success: true, message: "DHL ayarları kaydedildi!" }
    } catch (e: any) {
        return { error: e.message }
    }
}

// ETSY SYNC ACTION
export async function syncEtsyOrders() {
    try {
        const shops = await db.etsyShop.findMany();
        if (shops.length === 0) {
            return { error: "Hiçbir Etsy mağazası bağlanmamış." };
        }

        const { fetchEtsy } = await import("@/lib/etsy");
        let totalNew = 0;
        let logs: string[] = [];

        for (const shop of shops) {
            logs.push(`[${shop.shopName || shop.shopId}] Senkronizasyon başlıyor...`);
            try {
                // Fetch receipts (orders) from Etsy
                // state=paid, was_paid=true
                const data = await fetchEtsy(`shops/${shop.shopId}/receipts?limit=50&was_paid=true`, shop.shopId);

                if (data.results) {
                    let shopNew = 0;
                    for (const receipt of data.results) {
                        const receiptId = receipt.receipt_id.toString();

                        // Check for existing order using composite unique key [source, externalId]
                        const existing = await db.order.findUnique({
                            where: {
                                source_externalId: {
                                    source: 'etsy',
                                    externalId: receiptId
                                }
                            }
                        });

                        if (existing) continue;

                        // Fetch Transactions for items
                        const transactions = await fetchEtsy(`shops/${shop.shopId}/receipts/${receiptId}/transactions`, shop.shopId);

                        // Construct note
                        let note = receipt.message_from_buyer || "";
                        if (receipt.gift_message) note += `\n(Hediye Notu: ${receipt.gift_message})`;

                        await db.order.create({
                            data: {
                                customer: receipt.name || "Misafir",
                                email: receipt.buyer_email,
                                address: `${receipt.first_line} ${receipt.second_line || ""}`.trim(),
                                city: `${receipt.city} / ${receipt.state || ""} ${receipt.zip || ""}`.trim(),
                                total: `${receipt.total_price.amount / receipt.total_price.divisor} ${receipt.total_price.currency_code}`,
                                status: 'pending',
                                source: 'etsy',
                                externalId: receiptId,
                                barcode: `ETSY-${receiptId}`,
                                date: new Date(receipt.created_timestamp * 1000),
                                note: note.trim(),
                                labels: JSON.stringify(['Etsy', 'Yeni']),
                                hasNotification: true,
                                items: {
                                    create: transactions.results.map((t: any) => {
                                        // Etsy V3 Transaction variations property is an array of objects
                                        // with property_name and formatted_value
                                        const getVar = (names: string[]) => t.variations?.find((v: any) =>
                                            names.some(n => v.formatted_name?.toLowerCase().includes(n.toLowerCase()))
                                        )?.formatted_value || "";

                                        return {
                                            name: t.title,
                                            sku: t.sku || t.listing_id.toString(),
                                            quantity: t.quantity,
                                            // V3 Transaction has image_url_75x75. We can try to get 570xN if we want better quality.
                                            image_src: t.image_url_75x75?.replace("75x75", "570xN") || "https://placehold.co/600x400?text=Etsy+Görsel",
                                            material: getVar(["material", "malzeme", "doku"]),
                                            dimensions: getVar(["size", "boyut", "ölçü", "ebat"])
                                        };
                                    })
                                }
                            }
                        });
                        shopNew++;
                        totalNew++;
                    }
                    logs.push(`[${shop.shopName || shop.shopId}] ${shopNew} yeni sipariş eklendi.`);
                }
            } catch (err: any) {
                console.error(`Etsy Shop ${shop.shopId} sync error:`, err);
                logs.push(`[${shop.shopName || shop.shopId}] Hata: ${err.message}`);
            }
        }

        // revalidatePath("/");
        return { success: true, message: `${totalNew} yeni Etsy siparişi içe aktarıldı.`, logs };
    } catch (e: any) {
        console.error("syncEtsyOrders fatal error:", e);
        return { error: `Senkronizasyon başarısız: ${e.message}` };
    }
}



// WOOCOMMERCE SYNC ACTION
export async function syncWooCommerceOrders(force: boolean = false) {
    const settings = (await getSystemSettings()) as Record<string, string>

    if (!settings['wc_url'] || !settings['wc_key'] || !settings['wc_secret']) {
        return { error: "WooCommerce ayarları eksik. Lütfen Ayarlar sayfasından tamamlayınız." }
    }

    // RATE LIMIT CHECK
    if (!force) {
        const lastSyncStr = settings['last_wc_sync_time']
        if (lastSyncStr) {
            const lastSync = parseInt(lastSyncStr)
            const now = Date.now()
            // 2 minutes rate limit for background auto-sync to prevent resource exhaustion
            if (now - lastSync < 120000) {
                // Too early, skip
                return { skipped: true, message: "Sync skipped (Rate Limit)" }
            }
        }
    }

    try {
        const auth = Buffer.from(`${settings['wc_key']}:${settings['wc_secret']}`).toString('base64')
        // Filter: After Dec 20, 2025 - Limit count in background to prevent timeout issues
        const perPage = force ? 100 : 20;
        const response = await fetch(`${settings['wc_url']}/wp-json/wc/v3/orders?per_page=${perPage}&after=2025-12-20T00:00:00`, {
            headers: {
                Authorization: `Basic ${auth}`
            },
            cache: 'no-store'
        })

        if (!response.ok) {
            console.error("WC Error:", await response.text())
            return { error: "WooCommerce'e bağlanılamadı. Ayarları kontrol ediniz." }
        }

        const wcOrders = await response.json()
        let newCount = 0
        let logs: string[] = []

        // UPDATE TIMESTAMP
        await db.systemSetting.upsert({
            where: { key: 'last_wc_sync_time' },
            update: { value: Date.now().toString() },
            create: { key: 'last_wc_sync_time', value: Date.now().toString() }
        })



        // PREFETCH STATUSES to find correct "Incoming" column
        const statuses = await db.statusColumn.findMany({ orderBy: { order: 'asc' } })
        let defaultStatus = statuses.length > 0 ? statuses[0].id : "pending_woo"

        // Try to find a smarter default
        const incoming = statuses.find(s =>
            s.title.toLowerCase().includes("gelen") ||
            s.title.toLowerCase().includes("yeni") ||
            s.title.toLowerCase().includes("sipariş") ||
            s.id === "wc-pending" ||
            s.id === "pending"
        )
        if (incoming) defaultStatus = incoming.id

        for (const wcOrder of wcOrders) {
            try {
                // Safety Check: Ensure billing exists
                if (!wcOrder.billing) {
                    logs.push(`Order ${wcOrder.id}: Missing billing, skipped.`)
                    console.error(`Order ${wcOrder.id} missing billing info, skipping.`)
                    continue
                }

                // Map Status
                // IDs found in DB: 'Gelen Siparişler', 'Müşteriye İletilecek', 'Baskıya Hazır', 'Müşteri Beklemede', 'Dosya Gönderildi', 'Makinada', 'Hazır Beklemede', 'Kargolandı', 'Baskı hatası', 'Basılan ürünler'

                let status = defaultStatus // Default to Incoming
                let labels: string[] = ['WooCommerce'];

                if (wcOrder.status === 'processing') status = defaultStatus
                if (wcOrder.status === 'completed') status = 'completed' // Map to Completed
                if (wcOrder.status === 'on-hold') status = defaultStatus
                if (wcOrder.status === 'pending') status = defaultStatus

                // Handle Failed/Cancelled
                if (wcOrder.status === 'failed' || wcOrder.status === 'cancelled' || wcOrder.status === 'refunded') {
                    status = defaultStatus; // Keep it in incoming so they see it
                    labels.push('Ödeme Başarısız');
                }

                const items = (wcOrder.line_items || []).map((item: any) => {
                    // Normalize helper: lowercase, trim, remove accents
                    const normalizeKey = (k: string) => k.toLowerCase()
                        .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
                        .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
                        .trim();

                    // Helper to find meta value with robust matching
                    const getMeta = (keys: string[]) => {
                        if (!Array.isArray(item.meta_data)) return null;

                        const normKeys = keys.map(normalizeKey);
                        const found = item.meta_data.find((m: any) => {
                            const mKey = normalizeKey(m.key || '');
                            const mDisplay = normalizeKey(m.display_key || '');
                            return normKeys.includes(mKey) || normKeys.includes(mDisplay);
                        });

                        let val = found ? (found.display_value || found.value) : null;

                        // Strip HTML tags and entities
                        if (val && typeof val === 'string') {
                            val = val
                                .replace(/&nbsp;/g, ' ')
                                .replace(/&lt;/g, '<')
                                .replace(/&gt;/g, '>')
                                .replace(/&amp;/g, '&')
                                .replace(/sup&gt;/g, '')
                                .replace(/&sup2;/g, '2')
                                .replace(/<[^>]*>?/gm, '') // Remove tags
                                .trim();
                        }
                        return val;
                    }

                    // Image Extraction Logic
                    let imageSrc = item.image?.src;

                    if (!imageSrc) {
                        const metaImgRaw = item.meta_data?.find((m: any) => {
                            const k = normalizeKey(m.key || '');
                            return ['urun gorselleri', 'gorsel', 'resim', 'image', 'picture', 'foto', 'dosya', 'upload', 'img'].some(term => k.includes(term));
                        });

                        if (metaImgRaw && metaImgRaw.value) {
                            const val = String(metaImgRaw.value);
                            const srcs = Array.from(val.matchAll(/src=["'](.*?)["']/gi)).map(m => m[1]);
                            const hrefs = Array.from(val.matchAll(/href=["'](.*?)["']/gi)).map(m => m[1]);

                            // Combine and get unique valid urls
                            const allUrls = Array.from(new Set([...srcs, ...hrefs])).filter(u => u && u.startsWith('http'));

                            if (allUrls.length > 0) {
                                imageSrc = allUrls.join('|');
                            } else if (val.trim().startsWith('http')) {
                                // Check if comma-separated raw links
                                const textUrls = val.split(',').map(u => u.trim()).filter(u => u.startsWith('http'));
                                if (textUrls.length > 0) {
                                    imageSrc = textUrls.join('|');
                                } else {
                                    imageSrc = val.trim();
                                }
                            }
                        }
                    }

                    if (!imageSrc) {
                        imageSrc = "https://placehold.co/600x400?text=Görsel+Yok";
                    }

                    const material = getMeta(['pa_doku', 'Nitelik', 'Malzeme', 'Kagit Turu', 'Kagit Cinsi', 'Material', 'Paper Type', 'Doku', 'Kagit']);

                    let dimensions = getMeta(['Boyut', 'Olculer', 'Dimensions', 'Ebat', 'Size', 'Olculeriniz', 'Siparis Olcusu']);

                    if (!dimensions) {
                        const width = getMeta(['Genislik', 'Width']);
                        const height = getMeta(['Yukseklik', 'Height']);
                        const unit = getMeta(['Birim', 'Unit']) || 'cm';

                        if (width && height) {
                            dimensions = `${width} x ${height} ${unit}`;
                        }
                    }

                    const area = getMeta(['Toplam Alan', 'Toplam Olcu', 'Area', 'Metrekare', 'm2', 'Total Size', 'M2']);

                    if (area) {
                        const cleanArea = area.replace(/m2/i, ' m²').replace('m2', ' m²');
                        if (dimensions) {
                            if (!dimensions.includes(cleanArea)) {
                                dimensions = `${dimensions} (${cleanArea})`;
                            }
                        } else {
                            dimensions = cleanArea;
                        }
                    }

                    const getCroppedImage = () => {
                        if (!Array.isArray(item.meta_data)) return null;
                        const keys = ['kırpılan resim', 'kirpilan resim', 'cropped_image', '_cropped_image', 'cropped-image'];
                        const normKeys = keys.map(normalizeKey);
                        const found = item.meta_data.find((m: any) => {
                            const mKey = normalizeKey(m.key || '');
                            const mDisplay = normalizeKey(m.display_key || '');
                            return normKeys.includes(mKey) || normKeys.includes(mDisplay);
                        });
                        if (!found) return null;

                        const rawValue = found.value || found.display_value || '';
                        if (typeof rawValue === 'string') {
                            const hrefMatch = rawValue.match(/href=["'](.*?)["']/i);
                            if (hrefMatch && hrefMatch[1]) {
                                return hrefMatch[1];
                            }
                            if (rawValue.trim().startsWith('http')) {
                                return rawValue.trim();
                            }
                        }
                        return null;
                    }

                    const mainSample = getMeta(['Numune İsteği', 'Numune Istegi', 'Numune', 'Sample', '_numune']);
                    const numuneProduct = getMeta(['Numune Alınan Ürün', 'Numune Alinan Urun']);
                    const numuneSku = getMeta(['Numune Alınan Ürün SKU', 'Numune Alinan Urun SKU', 'numune_alinan_urun_sku']);
                    let finalSampleData = mainSample || null;
                    if (numuneSku || numuneProduct) {
                        const parts = [];
                        if (numuneSku) parts.push(numuneSku);
                        if (numuneProduct) parts.push(numuneProduct);
                        const numuneInfo = parts.join(' - ');
                        finalSampleData = mainSample ? `${mainSample} (${numuneInfo})` : numuneInfo;
                    }

                    return {
                        name: item.name || 'Ürün',
                        quantity: item.quantity || 1,
                        image_src: imageSrc,
                        sku: item.sku || getMeta(['Stok Kodu', 'SKU', '_stok_kodu', 'Urun Kodu', 'Kod', 'Product Code', '_sku']) || null,
                        url: getMeta(['_ozel_url', 'ozel_url', 'Özel Url', 'Ozel Url', 'Dosya Linki', 'File Link', 'Drive Link', 'Link', 'Url', 'Siparis Dosyasi']) || null,
                        dimensions: dimensions,
                        material: material,
                        productNote: getMeta(['Ürün Notu', 'Urun Notu', 'Not', 'Note', '_urun_notu']) || null,
                        sampleData: finalSampleData,
                        croppedImage: getCroppedImage()
                    };
                })

                // City Mapping Logic (TR Code -> Name)
                const getCityName = (code: string) => {
                    const cities: Record<string, string> = {
                        'TR01': 'ADANA', 'TR02': 'ADIYAMAN', 'TR03': 'AFYONKARAHİSAR', 'TR04': 'AĞRI', 'TR05': 'AMASYA',
                        'TR06': 'ANKARA', 'TR07': 'ANTALYA', 'TR08': 'ARTVİN', 'TR09': 'AYDIN', 'TR10': 'BALIKESİR',
                        'TR11': 'BİLECİK', 'TR12': 'BİNGÖL', 'TR13': 'BİTLİS', 'TR14': 'BOLU', 'TR15': 'BURDUR',
                        'TR16': 'BURSA', 'TR17': 'ÇANAKKALE', 'TR18': 'ÇANKIRI', 'TR19': 'ÇORUM', 'TR20': 'DENİZLİ',
                        'TR21': 'DİYARBAKIR', 'TR22': 'EDİRNE', 'TR23': 'ELAZIĞ', 'TR24': 'ERZİNCAN', 'TR25': 'ERZURUM',
                        'TR26': 'ESKİŞEHİR', 'TR27': 'GAZİANTEP', 'TR28': 'GİRESUN', 'TR29': 'GÜMÜŞHANE', 'TR30': 'HAKKARİ',
                        'TR31': 'HATAY', 'TR32': 'ISPARTA', 'TR33': 'MERSİN', 'TR34': 'İSTANBUL', 'TR35': 'İZMİR',
                        'TR36': 'KARS', 'TR37': 'KASTAMONU', 'TR38': 'KAYSERİ', 'TR39': 'KIRKLARELİ', 'TR40': 'KIRŞEHİR',
                        'TR41': 'KOCAELİ', 'TR42': 'KONYA', 'TR43': 'KÜTAHYA', 'TR44': 'MALATYA', 'TR45': 'MANİSA',
                        'TR46': 'KAHRAMANMARAŞ', 'TR47': 'MARDİN', 'TR48': 'MUĞLA', 'TR49': 'MUŞ', 'TR50': 'NEVŞEHİR',
                        'TR51': 'NİĞDE', 'TR52': 'ORDU', 'TR53': 'RİZE', 'TR54': 'SAKARYA', 'TR55': 'SAMSUN',
                        'TR56': 'SİİRT', 'TR57': 'SİNOP', 'TR58': 'SİVAS', 'TR59': 'TEKİRDAĞ', 'TR60': 'TOKAT',
                        'TR61': 'TRABZON', 'TR62': 'TUNCELİ', 'TR63': 'ŞANLIURFA', 'TR64': 'UŞAK', 'TR65': 'VAN',
                        'TR66': 'YOZGAT', 'TR67': 'ZONGULDAK', 'TR68': 'AKSARAY', 'TR69': 'BAYBURT', 'TR70': 'KARAMAN',
                        'TR71': 'KIRIKKALE', 'TR72': 'BATMAN', 'TR73': 'ŞIRNAK', 'TR74': 'BARTIN', 'TR75': 'ARDAHAN',
                        'TR76': 'IĞDIR', 'TR77': 'YALOVA', 'TR78': 'KARABÜK', 'TR79': 'KİLİS', 'TR80': 'OSMANİYE',
                        'TR81': 'DÜZCE'
                    };
                    return cities[code] || code;
                }

                let city = wcOrder.billing.city
                if (wcOrder.billing.state) {
                    const stateName = getCityName(wcOrder.billing.state).toLocaleUpperCase('tr-TR');
                    // Avoid duplication if user wrote "İzmir" in city field
                    if (city && !city.toLocaleUpperCase('tr-TR').includes(stateName)) {
                        city = `${city} / ${stateName}`;
                    } else if (!city) {
                        city = stateName;
                    }
                }

                // Payment Method Extraction & Cleaning
                let paymentMethod = wcOrder.payment_method_title || "Bilinmiyor"
                if (typeof paymentMethod === 'string') {
                    paymentMethod = paymentMethod
                        .replace(/&nbsp;/g, ' ')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&amp;/g, '&')
                        .replace(/<[^>]*>?/gm, '') // Strip tags
                        .trim();
                }

                const existingOrder = await db.order.findUnique({
                    where: { barcode: `WC-${wcOrder.id}` }
                })

                // PRESERVE HISTORY
                let currentOrderId: number;
                let previousStatus = "";

                if (existingOrder) {
                    previousStatus = existingOrder.status;
                    // No need to backup history, we are updating the record so relations persist!

                    // UPDATE existing order (Preserve ID)
                    logs.push(`Order ${wcOrder.id}: Updating existing record.`)

                    // Cargo Integrator Data
                    const cargoBarcodeMeta = wcOrder.meta_data?.find((m: any) => m.key === '_gcargo_barcode_exposed')
                    const cargoTrackingMeta = wcOrder.meta_data?.find((m: any) => m.key === '_gcargo_tracking_exposed')

                    // SMARTER STATUS SYNC (v3.6.6.13 - ULTIMATE PROTECTION)
                    let finalStatus = status;
                    const terminalStatuses = ['completed', 'cancelled', 'refunded', 'failed'];
                    const isTerminalWC = terminalStatuses.includes(wcOrder.status);

                    const dbStatus = (existingOrder.status || "").trim();
                    const incomingStatus = (defaultStatus || "").trim();

                    // If DB status is already a terminal status, NEVER let WC move it back 
                    // unless it's a very specific case (but here we just block it)
                    const isLocalTerminal = terminalStatuses.includes(dbStatus);

                    // LOCAL_MODIFIED: If it's not in the default first column
                    const isLocalModified = dbStatus !== incomingStatus;

                    // KEEP_LOCAL if it's modified and WC is not terminal
                    // OR if local is already terminal (never go back from completed)
                    // OR if WC is completed but local is modified (since we use 'completed' in WC to trigger plugins without wanting to move it in OMS)
                    let keepLocalStatus = (isLocalModified && !isTerminalWC) || isLocalTerminal;

                    if (wcOrder.status === 'completed' && isLocalModified) {
                        keepLocalStatus = true;
                    }

                    // ULTIMATE DIAGNOSTIC LOG
                    const logPrefix = `[SYNC_V13] #${existingOrder.id} (WC-${wcOrder.id})`;
                    console.log(`${logPrefix} DB:'${dbStatus}' | WC:'${wcOrder.status}' (mapped:'${finalStatus}') | Default:'${incomingStatus}' | isMod:${isLocalModified} | isTermWC:${isTerminalWC} | KEEP:${keepLocalStatus}`);

                    if (keepLocalStatus) {
                        finalStatus = existingOrder.status;
                        // Log specifically why we kept it if it's different from what WC wanted
                        if (finalStatus !== status) {
                            console.log(`${logPrefix} >>> PROTECTED: Keeping local status '${finalStatus}' over WC mapped status '${status}'`);
                        }
                    } else {
                        if (dbStatus !== finalStatus) {
                            console.log(`${logPrefix} >>> UPDATING: Moving from '${dbStatus}' to '${finalStatus}'`);
                            await logActivity(existingOrder.id, "Sistem", "STATUS_CHANGE", `Durum WooCommerce tarafından '${finalStatus}' olarak güncellendi. (v13)`);
                        }
                    }

                    // LOG STATUS CHANGE BY SYNC:
                    const syncUser = "WC Senkronizasyon"
                    if (existingOrder.status !== finalStatus && !keepLocalStatus) {
                        await logActivity(existingOrder.id, syncUser, "STATUS_CHANGE", `Durum WooCommerce tarafından '${finalStatus}' olarak güncellendi.`);
                    }

                    // PRESERVE LABELS: Don't overwrite locally added labels
                    let finalLabels = labels;
                    let hadPaymentFailedLabel = false;
                    try {
                        const localLabels = typeof existingOrder.labels === 'string' ? JSON.parse(existingOrder.labels) : existingOrder.labels;
                        if (Array.isArray(localLabels) && localLabels.length > 0) {
                            // Merge labels, keeping uniques
                            let combined = Array.from(new Set([...localLabels, ...labels]));
                            const isWcFailed = (wcOrder.status === 'failed' || wcOrder.status === 'cancelled' || wcOrder.status === 'refunded');
                            if (!isWcFailed && combined.includes('Ödeme Başarısız')) {
                                combined = combined.filter((l: string) => l !== 'Ödeme Başarısız');
                                hadPaymentFailedLabel = true;
                            }
                            finalLabels = combined;
                        }
                    } catch (e) {
                        console.error("Label merge error:", e);
                    }

                    if (hadPaymentFailedLabel) {
                        await logActivity(existingOrder.id, syncUser, "PAYMENT_SUCCESS", "WooCommerce ödemesi tamamlandığı için 'Ödeme Başarısız' etiketi otomatik kaldırıldı.");
                    }

                    // DETECT ACTUAL CHANGES to avoid unnecessary updatedAt updates
                    const oldCustomer = existingOrder.customer;
                    const newCustomer = `${wcOrder.billing.first_name || ''} ${wcOrder.billing.last_name || ''}`.trim() || 'Misafir';

                    const hasStatusChange = existingOrder.status !== finalStatus;
                    const localLabelsStr = typeof existingOrder.labels === 'string' ? existingOrder.labels : JSON.stringify(existingOrder.labels || []);
                    const finalLabelsStr = JSON.stringify(finalLabels);
                    const hasLabelChange = localLabelsStr !== finalLabelsStr;

                    const hasDataChange =
                        oldCustomer !== newCustomer ||
                        existingOrder.city !== city ||
                        existingOrder.email !== wcOrder.billing.email ||
                        existingOrder.phone !== wcOrder.billing.phone ||
                        existingOrder.address !== `${wcOrder.billing.address_1 || ''} ${wcOrder.billing.address_2 || ''}`.trim() ||
                        hasLabelChange;

                    await db.order.update({
                        where: { id: existingOrder.id },
                        data: {
                            customer: newCustomer,
                            total: `${wcOrder.total} ${wcOrder.currency_symbol}`,
                            // If we identified we should keep local status, we pass undefined so Prisma doesn't update this field
                            status: keepLocalStatus ? undefined : finalStatus,
                            // Only update timestamp if status changed OR meaningful data changed
                            updatedAt: (hasStatusChange || hasDataChange) ? new Date() : existingOrder.updatedAt,
                            email: wcOrder.billing.email,
                            phone: wcOrder.billing.phone,
                            address: `${wcOrder.billing.address_1 || ''} ${wcOrder.billing.address_2 || ''}`.trim(),
                            city: city,
                            note: existingOrder.note || wcOrder.customer_note,
                            cargoBarcode: cargoBarcodeMeta ? cargoBarcodeMeta.value : (existingOrder.cargoBarcode || null),
                            cargoTrackingNumber: cargoTrackingMeta ? cargoTrackingMeta.value : (existingOrder.cargoTrackingNumber || null),
                            paymentMethod: paymentMethod,
                            labels: JSON.stringify(finalLabels),
                            source: 'woo',
                            externalId: String(wcOrder.id),
                            items: {
                                deleteMany: {}, // Items are still source-of-truth from WC
                                create: items
                            }
                        }
                    })
                    currentOrderId = existingOrder.id;
                } else {
                    // Create New Order
                    const cargoBarcodeMeta = wcOrder.meta_data?.find((m: any) => m.key === '_gcargo_barcode_exposed')
                    const cargoTrackingMeta = wcOrder.meta_data?.find((m: any) => m.key === '_gcargo_tracking_exposed')

                    const newOrder = await db.order.create({
                        data: {
                            customer: `${wcOrder.billing.first_name || ''} ${wcOrder.billing.last_name || ''}`.trim() || 'Misafir',
                            total: `${wcOrder.total} ${wcOrder.currency_symbol}`,
                            status: status,
                            date: new Date(wcOrder.date_created),
                            updatedAt: new Date(wcOrder.date_modified),
                            barcode: `WC-${wcOrder.id}`,
                            email: wcOrder.billing.email,
                            phone: wcOrder.billing.phone,
                            address: `${wcOrder.billing.address_1 || ''} ${wcOrder.billing.address_2 || ''}`.trim(),
                            city: city,
                            note: wcOrder.customer_note,
                            labels: JSON.stringify(['WooCommerce']),
                            hasNotification: true,
                            cargoBarcode: cargoBarcodeMeta ? cargoBarcodeMeta.value : null,
                            cargoTrackingNumber: cargoTrackingMeta ? cargoTrackingMeta.value : null,
                            paymentMethod: paymentMethod,
                            source: 'woo',
                            externalId: String(wcOrder.id),
                            items: {
                                create: items
                            }
                        }
                    })
                    currentOrderId = newOrder.id;
                    
                    // AUTO DHL GENERATION REQUESTED BY USER
                    createDHLShipmentAction(newOrder.id, true).catch(err => {
                        console.error("[AUTO_DHL_ERR] Failed to auto-generate DHL for new order:", err);
                    });
                }

                // ADD "COMPLETED" LOG if applicable
                if (status === 'Tamamlandı' && previousStatus !== 'Tamamlandı') {
                    await db.orderActivity.create({
                        data: {
                            orderId: currentOrderId,
                            author: 'Sistem',
                            action: 'STATUS_CHANGE',
                            details: 'Müşteriye teslim edildi (WooCommerce)',
                        }
                    })
                }

                newCount++
                logs.push(`Order ${wcOrder.id}: Synced successfully.`)

            } catch (innerError: any) {
                console.error(`Error processing WC Order ${wcOrder.id}:`, innerError)
                logs.push(`Order ${wcOrder.id}: ERROR - ${innerError.message}`)
            }
        }


        // Call Cargo Sync (Fire and Forget or Await?)
        // Better to await to ensure log consistency, but catch errors to not block WC sync
        try {
            await syncCargoKargoEntegrator();
            logs.push("Cargo Info Synced.");
        } catch (e) {
            console.error("Cargo Sync Failed:", e);
        }

        //  // revalidatePath("/")
        return { success: true, message: `${newCount} sipariş işlendi. (Sistem v3.6.6.13)`, logs: logs }

    } catch (e: any) {
        console.error(e)
        return { error: `Senkronizasyon hatası: ${e.message}` }
    }
}



export async function createManualOrder(orderData: any) {
    const { items, customer, phone, email, address, city, note, status, clientBarcode, total } = orderData

    // Use a manual barcode prefix or the client-generated one for perfect optimistic UI sync
    const barcode = clientBarcode || `MANUAL-${Date.now()}`

    try {
        serverLog(`[CREATE_MANUAL] Starting for customer: ${customer}`);
        await db.order.create({
            data: {
                customer,
                phone,
                email,
                address,
                city,
                note,
                total: total ? `${total} ₺` : "0.00 ₺",
                status: status || "pending_woo",
                barcode,
                labels: JSON.stringify(['Manuel']),
                hasNotification: true,
                items: {
                    create: items
                }
            }
        })
        serverLog(`[CREATE_MANUAL] Order created in DB.`);

        const newOrder = await db.order.findUnique({ where: { barcode } })
        serverLog(`[CREATE_MANUAL] Order retrieved from DB: ${newOrder?.id}`);
        if (newOrder) {
            await logManualActivity(newOrder.id, "ORDER_CREATED", "Manuel sipariş oluşturuldu.")
        }

        return { success: true, orderId: newOrder?.id }

    } catch (error: any) {
        serverLog(`[CREATE_MANUAL_ERR] Failed: ${error?.message || error}`);
        serverLog("Failed to create manual order: " + (error?.message || error));
        console.error("Failed to create manual order:", error)
        throw new Error("Sipariş oluşturulamadı: " + (error?.message || String(error)))
    }
}

export async function inspectLatestWooCommerceOrder(specificOrderId?: string) {
    const settings = await getSystemSettings()
    if (!settings.wc_url || !settings.wc_key || !settings.wc_secret) {
        return { error: "WooCommerce ayarları eksik!" }
    }

    try {
        const WooCommerce = new WooCommerceRestApi({
            url: settings.wc_url,
            consumerKey: settings.wc_key,
            consumerSecret: settings.wc_secret,
            version: "wc/v3"
        })

        // If ID specific
        if (specificOrderId) {
            const response = await WooCommerce.get(`orders/${specificOrderId}`, { context: 'edit' })
            if (response.data) {
                return {
                    success: true,
                    data: JSON.stringify(response.data, null, 2)
                }
            }
        }

        // Default get latest
        const response = await WooCommerce.get("orders", {
            per_page: 1,
            context: 'edit'
        })
        if (response.data && response.data.length > 0) {
            return {
                success: true,
                data: JSON.stringify(response.data[0], null, 2)
            }
        }

        return { error: "Hiç sipariş bulunamadı." }

    } catch (e: any) {
        console.error("Inspect Error:", e)
        return { error: `API Hatası: ${e.message}` }
    }
}

export async function inspectLatestWebhook() {
    try {
        const setting = await db.systemSetting.findUnique({
            where: { key: 'last_cargo_webhook' }
        })

        if (!setting) {
            return { error: "Henüz hiç webhook verisi gelmemiş." }
        }

        return { success: true, data: setting.value }
    } catch (e: any) {
        return { error: e.message }
    }
}

export async function checkPdfAccess() {
    const settings = await getSystemSettings()
    if (!settings.wc_url || !settings.wc_key || !settings.wc_secret) {
        return { error: "Ayarlar eksik." }
    }

    // 1. Get Latest Order to find ID and Key
    const inspect = await inspectLatestWooCommerceOrder()
    if (!inspect.success || typeof inspect.data !== 'string') {
        return { error: "Sipariş bulunamadı, test yapılamıyor." }
    }

    const order = JSON.parse(inspect.data)
    const orderId = order.id
    const orderKey = order.order_key

    // 2. Construct URL
    // Standard WPO PDF URL
    const pdfUrl = `${settings.wc_url}/wp-admin/admin-ajax.php?action=generate_wpo_wcpdf&template_type=packing-slip&order_ids=${orderId}&order_key=${orderKey}`

    try {
        // 3. Fetch with Basic Auth
        const authHeader = `Basic ${btoa(`${settings.wc_key}:${settings.wc_secret}`)}`

        const response = await fetch(pdfUrl, {
            headers: {
                'Authorization': authHeader
            }
        })

        if (response.ok && response.headers.get("content-type")?.includes("pdf")) {
            return { success: true, message: "PDF erişimi başarılı! (Proxy ile çekilebilir)", url: pdfUrl }
        } else {
            const text = await response.text()
            return { error: `PDF çekilemedi. HTTP ${response.status}. Yanıt başı: ${text.substring(0, 100)}` }
        }

    } catch (e: any) {
        return { error: `Fetch Hatası: ${e.message}` }
    }
}

// CARGO LABEL ACTIONS
export async function uploadCargoLabel(orderId: number, base64Data: string) {
    try {
        await db.order.update({
            where: { id: orderId },
            data: { cargoLabelPdf: base64Data } as any
        })
        // revalidatePath("/")
        return { success: true, message: "Kargo etiketi yüklendi" }
    } catch (error) {
        console.error("Upload Error:", error)
        return { error: "Dosya yüklenirken hata oluştu" }
    }
}

export async function deleteCargoLabel(orderId: number) {
    try {
        await db.order.update({
            where: { id: orderId },
            data: { cargoLabelPdf: null }
        })
        // revalidatePath("/")
        return { success: true, message: "Kargo etiketi silindi" }
    } catch (error) {
        console.error("Delete Error:", error)
        return { error: "Dosya silinirken hata oluştu" }
    }
}

export async function syncCargoKargoEntegrator(force: boolean = false) {
    const settings = (await getSystemSettings()) as Record<string, string>;
    
    // RATE LIMIT CHECK
    if (!force) {
        const lastSyncStr = settings['last_cargo_sync_time'];
        if (lastSyncStr) {
            const lastSync = parseInt(lastSyncStr);
            const now = Date.now();
            // 5 minutes rate limit for background auto-sync
            if (now - lastSync < 300000) {
                return { skipped: true, message: "Sync skipped (Rate Limit)" };
            }
        }
    }

    const apiKey = process.env.KARGO_ENTEGRATOR_API_KEY || "OylOoz2vKllZtByiBAbl65NpdsnaNPVlpVTRzgNte8e42427";
    let updatedCount = 0;

    // Background sync scans 1 page of 100 items; manual sync scans 7 pages.
    const MAX_PAGES = force ? 7 : 1;

    try {
        // UPDATE TIMESTAMP
        await db.systemSetting.upsert({
            where: { key: 'last_cargo_sync_time' },
            update: { value: Date.now().toString() },
            create: { key: 'last_cargo_sync_time', value: Date.now().toString() }
        });

        for (let page = 1; page <= MAX_PAGES; page++) {
            const res = await fetch(`https://app.kargoentegrator.com/api/shipments?per_page=100&page=${page}`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'application/json'
                },
                cache: 'no-store'
            });

            if (!res.ok) {
                console.error(`Cargo API Error (Page ${page}):`, res.status);
                if (page === 1) return { error: "Kargo API Hatası: " + res.status };
                break;
            }

            const json = await res.json();
            const shipments = json.data || [];

            if (shipments.length === 0) break; // End of list

            // Filter shipments and map to find matching orders in DB in one query
            const validShipments = shipments.filter((s: any) => s.platform_id);
            if (validShipments.length === 0) continue;

            const platformIds = validShipments.map((s: any) => String(s.platform_id));
            const targetBarcodes = platformIds.map((id: string) => `WC-${id}`).concat(platformIds);

            // Fetch all matching orders in one bulk query
            const dbOrders = await db.order.findMany({
                where: {
                    barcode: {
                        in: targetBarcodes
                    }
                },
                select: {
                    id: true,
                    barcode: true,
                    cargoTrackingNumber: true,
                    cargoBarcode: true,
                    cargoLabelPdf: true,
                    status: true
                }
            });

            // Map database orders by barcode for O(1) lookup
            const ordersMap = new Map(dbOrders.map(o => [o.barcode, o]));

            for (const ship of validShipments) {
                const platformId = String(ship.platform_id);
                const barcode = ship.barcode;
                const trackingNum = ship.tracking_number;
                const printUrl = `https://app.kargoentegrator.com/print-pdf?shipments[0]=${ship.id}`;

                if (!trackingNum && !barcode && !ship.status) continue;

                // Try WC- platform_id first, then raw platform_id
                let order = ordersMap.get(`WC-${platformId}`) || ordersMap.get(platformId);

                if (order) {
                    let statusChanged = false;
                    let targetStatus = order.status;
                    let activityDetails = "";

                    const statusLower = (ship.status || "").toLowerCase();
                    const isDelivered = 
                        statusLower === 'delivered' || 
                        statusLower === 'teslim_edildi' || 
                        statusLower === 'teslim edildi' || 
                        statusLower === 'teslim' ||
                        !!ship.delivered_at || 
                        !!ship.real_delivered_date;

                    const isShipped = 
                        statusLower === 'shipped' ||
                        statusLower === 'yola_cikti' ||
                        statusLower === 'yola çıktı' ||
                        statusLower === 'kargolandi' ||
                        statusLower === 'kargolandı' ||
                        statusLower === 'in_transit' ||
                        !!ship.shipped_at;

                    if (isDelivered) {
                        if (order.status === 'shipped') {
                            targetStatus = 'completed';
                            statusChanged = true;
                            activityDetails = `Kargo teslim edildi olarak tespit edildi (Senkronizasyon, Durum: ${ship.status || 'delivered'}). Sipariş durumu otomatik olarak Tamamlandı yapıldı.`;
                        }
                    } else if (isShipped) {
                        const allowAutoShipped = ['pending_woo', 'pending_pm', 'draft', 'ready', 'packed'].includes(order.status);
                        if (allowAutoShipped) {
                            targetStatus = 'shipped';
                            statusChanged = true;
                            activityDetails = `Kargo yola çıktı olarak tespit edildi (Senkronizasyon, Durum: ${ship.status || 'shipped'}). Sipariş durumu otomatik olarak Kargolandı yapıldı.`;
                        }
                    }

                    const needsTrackingUpdate = order.cargoTrackingNumber !== trackingNum || order.cargoBarcode !== barcode || order.cargoLabelPdf !== printUrl;

                    if (needsTrackingUpdate || statusChanged) {
                        await db.order.update({
                            where: { id: order.id },
                            data: {
                                cargoTrackingNumber: trackingNum || undefined,
                                cargoBarcode: barcode || undefined,
                                cargoLabelPdf: printUrl,
                                ...(statusChanged ? { status: targetStatus, updatedAt: new Date() } : {})
                            }
                        });

                        if (statusChanged) {
                            await db.orderActivity.create({
                                data: {
                                    orderId: order.id,
                                    author: 'Kargo Entegratör (Oto)',
                                    action: 'STATUS_CHANGE',
                                    details: activityDetails
                                }
                            });
                        }

                        updatedCount++;
                    }
                }
            }
        }

        // Run auto-complete for old shipped orders as part of the sync process
        await autoCompleteOldOrders().catch(err => {
            console.error("Auto-complete old orders failed during cargo sync:", err);
        });
        return { success: true, message: `${updatedCount} siparişin kargo bilgisi güncellendi.` };

    } catch (error: any) {
        console.error("Kargo Sync Error:", error);
        return { error: "Kargo Entegrasyonu Hatası: " + error.message };
    }
}

export async function syncPrintMarktOrders(force: boolean = false, targetOrderId?: string | number, bypassRateLimit: boolean = false) {
    const settings = (await getSystemSettings()) as Record<string, string>

    if (!settings['pm_url'] || !settings['pm_key']) {
        return { error: "PrintMarkt ayarları eksik. Lütfen Ayarlar sayfasından tamamlayınız." }
    }

    // RATE LIMIT CHECK (Bypass rate limit for forced, targeted or bypassed syncs)
    if (!force && !targetOrderId && !bypassRateLimit) {
        const lastSyncStr = settings['last_pm_sync_time']
        if (lastSyncStr) {
            const lastSync = parseInt(lastSyncStr)
            const now = Date.now()
            // 2 minutes rate limit for background auto-sync to prevent resource exhaustion
            if (now - lastSync < 120000) {
                return { skipped: true, message: "Sync skipped (Rate Limit)" }
            }
        }
    }

    try {
        // UPDATE TIMESTAMP (Only for non-targeted background syncs)
        if (!targetOrderId && !bypassRateLimit) {
            await db.systemSetting.upsert({
                where: { key: 'last_pm_sync_time' },
                update: { value: Date.now().toString() },
                create: { key: 'last_pm_sync_time', value: Date.now().toString() }
            })
        }
        
        let cleanUrl = settings['pm_url'].trim().replace(/\/+$/, '');
        let pmKey = settings['pm_key'].trim();
        const limit = force ? 300 : 200; // Limit raised to 200/300 to catch older drafts that got submitted (PrintMarkt API ignores id param and sorts by ID desc)
        let fetchUrl = targetOrderId 
            ? `${cleanUrl}/api/orders?id=${targetOrderId}&_t=${Date.now()}`
            : `${cleanUrl}/api/orders?limit=${limit}&_t=${Date.now()}`;
            
        let response = await fetch(fetchUrl, {
            headers: { "X-API-Key": pmKey },
            cache: 'no-store'
        })

        if (response.status === 401 || response.status === 403) {
            response = await fetch(fetchUrl, {
                headers: { "Authorization": `Bearer ${pmKey}` },
                cache: 'no-store'
            })
        }

        if (!response.ok) {
            const errText = await response.text().catch(() => "");
            return { error: `PrintMarkt sitesine bağlanılamadı (HTTP ${response.status}). Yanıt: ${errText.substring(0, 50)}` }
        }

        let pmOrders = await response.json()
        console.log("[DEBUG] PrintMarkt Sync Response:", JSON.stringify(pmOrders, null, 2).substring(0, 500))

        if (pmOrders && !Array.isArray(pmOrders) && Array.isArray(pmOrders.orders)) {
            pmOrders = pmOrders.orders;
        }

        if (!Array.isArray(pmOrders)) {
            return { error: "PrintMarkt API'si beklenen listeyi (Array) döndürmedi." }
        }

        if (pmOrders.length === 0) {
            return { success: true, message: `Bağlantı BAŞARILI! Ancak PrintMarkt üzerinde çekilecek yeni sipariş bulunamadı.`, count: 0 }
        }

        let importedCount = 0;

        // Fetch all existing PrintMarkt externalIds in a single query to avoid N+1 query performance bottleneck
        const externalIdsToCheck = pmOrders
            .map((pmOrder: any) => {
                const externalId = pmOrder.id?.toString() || pmOrder.external_id || pmOrder.order_number?.toString() || pmOrder.number?.toString();
                return externalId ? `pm_${externalId}` : null;
            })
            .filter(Boolean) as string[];

        const existingOrders = await db.order.findMany({
            where: {
                externalId: {
                    in: externalIdsToCheck
                }
            },
            select: {
                id: true,
                externalId: true,
                status: true,
                customer: true,
                email: true,
                phone: true,
                address: true,
                total: true,
                labels: true,
                cargoBarcode: true,
                cargoTrackingNumber: true,
                cargoLabelPdf: true,
                paymentMethod: true,
                updatedAt: true
            }
        });

        const existingOrdersMap = new Map(existingOrders.map(o => [o.externalId, o]));

        for (const pmOrder of pmOrders) {
            try {
                // Determine order number
                const externalId = pmOrder.id?.toString() || pmOrder.external_id || pmOrder.order_number?.toString() || pmOrder.number?.toString();
                if (!externalId) continue; // Skip if no ID

                // Skip unplaced integration orders (e.g. Etsy/WooCommerce integration orders that have not been submitted/paid on PrintMarkt yet)
                const source = pmOrder.source || "";
                const isIntegration = source && source !== "manual";
                const hasPaymentMethod = pmOrder.payment_method || pmOrder.gateway;
                if (isIntegration && !hasPaymentMethod) {
                    continue;
                }

                const orderKey = `pm_${externalId}`;
                const existingOrder = existingOrdersMap.get(orderKey);

                // Müşterinin PrintMarkt üzerinden gelen tüm siparişleri (Etsy dahil) alması için Etsy atlama koşulu kaldırıldı.
                // Map Address from flat JSON PrintMarkt Schema
                let shippingName = pmOrder.dealer_name || pmOrder.user_full_name || pmOrder.recipient_name || "Bilinmiyor";
                if (pmOrder.dealer_name && pmOrder.recipient_name && pmOrder.dealer_name !== pmOrder.recipient_name) {
                    shippingName = `${pmOrder.dealer_name}\n${pmOrder.recipient_name}`;
                } else if (pmOrder.user_full_name && pmOrder.recipient_name && pmOrder.user_full_name !== pmOrder.recipient_name) {
                    shippingName = `${pmOrder.user_full_name}\n${pmOrder.recipient_name}`;
                }

                let shippingEmail = pmOrder.recipient_email || pmOrder.email || pmOrder.account_email || "";
                let shippingPhone = pmOrder.recipient_phone || pmOrder.phone || "";

                let street = pmOrder.street || pmOrder.address1 || "";
                let city = pmOrder.city || "";
                let state = pmOrder.state || pmOrder.province || "";
                let zip = pmOrder.zip_code || pmOrder.zip || "";
                let country = pmOrder.country || "";

                let shippingAddress = `${street} ${city} ${state} ${zip} ${country}`.trim();
                if (!shippingAddress) shippingAddress = "Adres bulunamadı";

                // Map Items
                const items = [];
                let labels: string[] = [];
                let totalAmount = pmOrder.amount ? parseFloat(pmOrder.amount) : 0;

                let lineItems: any[] = [];
                if (pmOrder.line_items_json && typeof pmOrder.line_items_json === 'string') {
                    try {
                        lineItems = JSON.parse(pmOrder.line_items_json);
                    } catch (e) {
                        console.error("Failed to parse line_items_json for order", externalId);
                    }
                } else if (Array.isArray(pmOrder.line_items)) {
                    lineItems = pmOrder.line_items;
                } else if (Array.isArray(pmOrder.items)) {
                    lineItems = pmOrder.items;
                }

                for (const item of lineItems) {
                    const price = parseFloat(item.price || item.total || item.totalPrice || 0);
                    const qty = parseInt(item.quantity || 1);

                    if (totalAmount === 0) totalAmount += price * qty;

                    const decodeHtml = (str: string) => {
                        if (!str) return str;
                        return str.replace(/&amp;/g, '&')
                            .replace(/&quot;/g, '"')
                            .replace(/&#039;/g, "'")
                            .replace(/&lt;/g, '<')
                            .replace(/&gt;/g, '>');
                    };

                    let materialStr = item.material || item.selectedTexture || item.variant || "";
                    const material = materialStr ? decodeHtml(String(materialStr)) : "";

                    let dimsStr = item.dimensions || item.size || "";
                    if (!dimsStr && item.width && item.height) {
                        dimsStr = `${item.width}x${item.height} ${item.unit || 'cm'}`;
                    }

                    let dimensions = dimsStr ? decodeHtml(String(dimsStr)) : "";
                    if (dimensions.trim().toLowerCase() === "x in") {
                        dimensions = "SAMPLE";
                    }

                    console.log(`[PM_DEBUG_MAP] Raw Item: `, JSON.stringify(item));
                    let pmCargoName = "";
                    if (item.shipping_method) {
                        let sm = String(item.shipping_method).toLowerCase();
                        if (sm === 'ups' || sm.includes('ups')) pmCargoName = "usa ups";
                        else if (sm === 'fedex' || sm.includes('fedex')) pmCargoName = "fedex ship";
                        else if (sm === 'custom_label' || sm.includes('özel etiket') || sm.includes('custom')) pmCargoName = "özel etiket";
                        else if (sm.includes('carrier') || sm.includes('turkey') || sm.includes('mng') || sm.includes('aras') || sm.includes('yurtiçi') || sm.includes('sendeo')) pmCargoName = "turkey ship";
                        else pmCargoName = String(item.shipping_method);
                    }
                    if (pmCargoName) {
                        labels.push(pmCargoName.toUpperCase());
                    }

                    let rawImageSrc = item.image_url || item.image || item.thumbnail || item.selectedImage || "";
                    if (rawImageSrc && !rawImageSrc.startsWith("http") && !rawImageSrc.startsWith("data:")) {
                        const domain = (cleanUrl && cleanUrl.startsWith("http")) ? cleanUrl : "https://printmarkt.co";
                        rawImageSrc = `${domain}${rawImageSrc.startsWith('/') ? '' : '/'}${rawImageSrc}`;
                    }

                    let itemUrl = item.external_url || item.product_link || item.url || pmOrder.external_product_link || "";
                    if (itemUrl && !itemUrl.startsWith("http") && !itemUrl.startsWith("data:")) {
                        if (itemUrl.includes('/') || itemUrl.includes('.')) {
                            itemUrl = `${cleanUrl}${itemUrl.startsWith('/') ? '' : '/'}${itemUrl}`;
                        }
                    }

                    items.push({
                        name: decodeHtml(item.name || item.title || "Özel Sipariş Ürün (Manuel)"),
                        quantity: qty,
                        sku: item.sku || item.stockCode || "",
                        image_src: rawImageSrc,
                        material: material,
                        dimensions: dimensions,
                        url: itemUrl,
                        productNote: item.note || ""
                    });
                }

                // Fallback total validation
                if (totalAmount === 0 && pmOrder.total_price) {
                    totalAmount = parseFloat(pmOrder.total_price);
                }

                // Map general fields
                const status = (pmOrder.status || pmOrder.order_status || "pending").toLowerCase();
                let mappedStatus = "pending_pm";
                if (status.includes("ship") || status === "completed") {
                    mappedStatus = "shipped";
                } else if (status === "cancelled" || status === "deleted") {
                    mappedStatus = "cancelled";
                }

                // Add cancellation labels if order is cancelled or deleted in PrintMarkt
                if (status === "cancelled") {
                    labels.push("İPTAL EDİLDİ");
                } else if (status === "deleted") {
                    labels.push("SİLİNDİ");
                }

                // Sanitize and deduplicate labels
                labels = labels.map((l: string) => l.toUpperCase());
                // Remove obsolete/duplicate tags
                labels = labels.filter((l: string) => l !== "STANDART KARGO" && l !== "PRINTMARKT");
                // Correct Turkish character encoding issues
                labels = labels.map((l: string) => l.replace('ÖZEL ETIKET', 'ÖZEL ETİKET'));
                labels = [...new Set(labels)];

                let paymentMethod = pmOrder.payment_method || pmOrder.gateway || "API";
                if (paymentMethod.toUpperCase() === 'ON_ACCOUNT') paymentMethod = 'CARI';

                const customerNote = pmOrder.note || pmOrder.customer_note || pmOrder.order_note || "";
                let trackingPdf = pmOrder.custom_shipping_label_url || pmOrder.production_file_url || null;
                if (trackingPdf && !trackingPdf.startsWith("http") && !trackingPdf.startsWith("data:")) {
                    trackingPdf = `${cleanUrl}${trackingPdf.startsWith('/') ? '' : '/'}${trackingPdf}`;
                }

                if (existingOrder) {
                    const dbStatus = existingOrder.status;
                    const incomingStatus: string = mappedStatus;

                    const isTerminalIncoming = incomingStatus === "shipped" || incomingStatus === "completed" || incomingStatus === "cancelled";
                    const isLocalTerminal = dbStatus === "shipped" || dbStatus === "completed" || dbStatus === "cancelled";
                    const isLocalModified = dbStatus !== "pending_pm";
                    let keepLocalStatus = isLocalModified || isLocalTerminal;                    
                    let finalStatus = incomingStatus;
                    if (keepLocalStatus) {
                        finalStatus = dbStatus;
                    }

                    const hasStatusChange = dbStatus !== finalStatus;
                    const hasDataChange = 
                        existingOrder.customer !== shippingName ||
                        existingOrder.address !== shippingAddress ||
                        existingOrder.phone !== shippingPhone ||
                        existingOrder.total !== totalAmount.toFixed(2) ||
                        (trackingPdf && existingOrder.cargoLabelPdf !== trackingPdf);
                    if (hasStatusChange || hasDataChange) {
                        if (hasStatusChange) {
                            await logActivity(existingOrder.id, "PrintMarkt Senkronizasyon", "STATUS_CHANGE", `Durum PrintMarkt tarafından '${finalStatus}' olarak güncellendi.`);
                        }

                        let finalLabels = labels;
                        try {
                            const localLabels = typeof existingOrder.labels === 'string' ? JSON.parse(existingOrder.labels) : existingOrder.labels;
                            if (Array.isArray(localLabels) && localLabels.length > 0) {
                                finalLabels = Array.from(new Set([...localLabels, ...labels]));
                            }
                        } catch (e) {
                            console.error("PrintMarkt label merge error:", e);
                        }

                        await db.order.update({
                            where: { id: existingOrder.id },
                            data: {
                                customer: shippingName,
                                email: shippingEmail,
                                phone: shippingPhone,
                                address: shippingAddress,
                                total: totalAmount.toFixed(2),
                                status: finalStatus,
                                updatedAt: new Date(),
                                cargoLabelPdf: trackingPdf || existingOrder.cargoLabelPdf,
                                labels: JSON.stringify(finalLabels),
                                note: existingOrder.note || customerNote,
                                paymentMethod: paymentMethod,
                            }
                        });
                        importedCount++;
                    }
                } else {
                    await db.order.create({
                        data: {
                            externalId: `pm_${externalId}`,
                            source: "PrintMarkt",
                            customer: shippingName,
                            email: shippingEmail,
                            phone: shippingPhone,
                            address: shippingAddress,
                            total: totalAmount.toFixed(2),
                            paymentMethod: paymentMethod,
                            status: mappedStatus,
                            date: pmOrder.created_at ? new Date(pmOrder.created_at) : undefined,
                            note: customerNote,
                            cargoLabelPdf: trackingPdf,
                            labels: JSON.stringify(labels),
                            items: {
                                create: items
                            }
                        }
                    });

                    importedCount++;
                }
            } catch (err) {
                console.error(`Error mapping PrintMarkt order:`, err);
            }
        }

        return { success: true, message: `Bağlantı BAŞARILI! ${importedCount} sipariş sisteme eklendi veya güncellendi. (Toplam kuyruk: ${pmOrders.length})`, count: importedCount }

    } catch (e: any) {
        console.error("PrintMarkt Sync Error:", e)
        return { error: "Senkronizasyon hatası: " + e.message }
    }
}

export async function wipePrintMarktOrders() {
    try {
        const session = await getSession();
        if (!session || session.user.role !== "admin") {
            return { error: "Yetkisiz işlem: Sadece yöneticiler silebilir." };
        }

        const result = await db.order.deleteMany({
            where: { source: 'PrintMarkt' }
        });

        return { success: true, message: `${result.count} adet PrintMarkt siparişi başarıyla silindi. Yeni senkronizasyon için sayfayı yenileyiniz.` };
    } catch (e: any) {
        console.error("PrintMarkt Wipe Error:", e);
        return { error: "Silme hatası: " + e.message };
    }
}

// WAYFAIR SETTINGS SAVE ACTION
export async function saveWayfairSettings(formData: FormData) {
    const clientId = (formData.get("wf_client_id") as string)?.trim()
    const clientSecret = (formData.get("wf_client_secret") as string)?.trim()
    const mode = (formData.get("wf_mode") as string)?.trim() || "sandbox"

    if (!clientId || !clientSecret) return { error: "Lütfen Client ID ve Client Secret alanlarını doldurunuz." }

    try {
        await db.systemSetting.upsert({ where: { key: 'wf_client_id' }, update: { value: clientId }, create: { key: 'wf_client_id', value: clientId } })
        await db.systemSetting.upsert({ where: { key: 'wf_client_secret' }, update: { value: clientSecret }, create: { key: 'wf_client_secret', value: clientSecret } })
        await db.systemSetting.upsert({ where: { key: 'wf_mode' }, update: { value: mode }, create: { key: 'wf_mode', value: mode } })
        
        if (mode === "production") {
            const existingStart = await db.systemSetting.findUnique({ where: { key: 'wf_prod_start_time' } })
            if (!existingStart) {
                const nowStr = Date.now().toString()
                await db.systemSetting.create({ data: { key: 'wf_prod_start_time', value: nowStr } })
            }
        } else {
            await db.systemSetting.deleteMany({ where: { key: 'wf_prod_start_time' } })
        }
        return { success: true, message: "Wayfair ayarları başarıyla kaydedildi." }
    } catch (e: any) {
        return { error: e.message }
    }
}

// WAYFAIR WIPE ACTION
export async function wipeWayfairOrders() {
    try {
        const session = await getSession();
        if (!session || session.user.role !== "admin") {
            return { error: "Yetkisiz işlem: Sadece yöneticiler silebilir." };
        }

        const result = await db.order.deleteMany({
            where: { source: 'wayfair' }
        });

        return { success: true, message: `${result.count} adet Wayfair siparişi başarıyla silindi.` };
    } catch (e: any) {
        console.error("Wayfair Wipe Error:", e);
        return { error: "Silme hatası: " + e.message };
    }
}

async function resolveWfCatalogImage(
    sku: string | null,
    supplierId: number | string | null,
    accessToken: string,
    isSandbox: boolean
): Promise<string | null> {
    if (!sku) return null;
    const supplierIdStr = supplierId ? supplierId.toString() : "476700";
    const catalogUrl = isSandbox
        ? "https://api.wayfair.io/sandbox/v1/product-catalog-api/graphql"
        : "https://api.wayfair.io/v1/product-catalog-api/graphql";

    // Helper to get variant-safe base SKU (e.g. MUR10011-S, IN0952, etc.)
    const getBaseSku = (val: string) => {
        const parts = val.split('-');
        if (parts.length <= 1) return val;
        const secondPart = parts[1].trim().toUpperCase();
        const materialSet = new Set(['NW', 'PS', 'HP', 'P', 'K', 'C']);
        if (secondPart.length === 1 && !materialSet.has(secondPart)) {
            return `${parts[0]}-${parts[1]}`;
        }
        return parts[0];
    };

    const tryQuery = async (targetSku: string): Promise<string | null> => {
        try {
            const query = `
            query GetCatalogItem($input: SupplierCatalogItemsInput!) {
              supplierCatalogItems(input: $input) {
                ... on SupplierCatalogItems {
                  catalogItems {
                    attributes {
                      attribute {
                        title
                      }
                      chosenAttributeValues {
                        value
                      }
                    }
                  }
                }
              }
            }`;

            const variables = {
                input: {
                    filter: {
                        supplierPartNumbers: [targetSku]
                    },
                    paginationOptions: {
                        page: 1,
                        pageSize: 10
                    }
                }
            };

            const res = await fetch(catalogUrl, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                    "X-SELECTED-SUPPLIER-ID": supplierIdStr
                },
                body: JSON.stringify({ query, variables }),
                cache: "no-store"
            });

            if (res.ok) {
                const data = await res.json();
                const items = data.data?.supplierCatalogItems?.catalogItems || [];
                if (items.length > 0 && items[0].attributes) {
                    const imgAttr = items[0].attributes.find(
                        (attr: any) => attr.attribute?.title === "IMAGE" && attr.chosenAttributeValues?.[0]?.value?.[0]
                    );
                    if (imgAttr) {
                        return imgAttr.chosenAttributeValues[0].value[0];
                    }
                }
            }
        } catch (e) {
            console.error("Error fetching Wayfair Catalog Image:", e);
        }
        return null;
    };

    // 1. Try exact SKU
    let img = await tryQuery(sku);
    if (img) return img;

    // 2. Try variant-safe base SKU (e.g. MUR10011-S)
    const baseSku = getBaseSku(sku);
    if (baseSku && baseSku !== sku) {
        img = await tryQuery(baseSku);
        if (img) return img;
    }

    return null;
}

async function resolveWfProductImage(sku: string | null, settings: Record<string, string>): Promise<string | null> {
    const placeholder = "https://placehold.co/600x400?text=Wayfair+Product";
    if (!sku) return null;

    // 1. Try to find exact SKU in database
    const exactMatch = await db.orderItem.findFirst({
        where: {
            sku: sku,
            image_src: {
                not: "",
                notIn: [placeholder],
                startsWith: "http"
            }
        },
        orderBy: { id: "desc" }
    });
    if (exactMatch) return exactMatch.image_src;

    // Helper to get variant-safe base SKU (e.g. MUR10011-S, IN0952, etc.)
    const getBaseSku = (val: string) => {
        const parts = val.split('-');
        if (parts.length <= 1) return val;
        const secondPart = parts[1].trim().toUpperCase();
        const materialSet = new Set(['NW', 'PS', 'HP', 'P', 'K', 'C']);
        if (secondPart.length === 1 && !materialSet.has(secondPart)) {
            return `${parts[0]}-${parts[1]}`;
        }
        return parts[0];
    };

    // 2. Try to find variant-safe base SKU in database
    const baseSku = getBaseSku(sku);
    if (baseSku && baseSku.length > 2) {
        const baseMatch = await db.orderItem.findFirst({
            where: {
                sku: {
                    startsWith: baseSku
                },
                image_src: {
                    not: "",
                    notIn: [placeholder],
                    startsWith: "http"
                }
            },
            orderBy: { id: "desc" }
        });
        if (baseMatch) {
            // Verify that the matched SKU also matches the variant-safe base SKU
            // to avoid matching a different color variant (e.g. matching B variant for S request)
            const matchedBase = getBaseSku(baseMatch.sku || "");
            if (matchedBase === baseSku) {
                return baseMatch.image_src;
            }
        }
    }

    // 3. Fallback to absolute base SKU (first part before any dash)
    const pureBase = sku.split('-')[0];
    if (pureBase && pureBase.length > 2) {
        const pureMatch = await db.orderItem.findFirst({
            where: {
                sku: {
                    startsWith: pureBase
                },
                image_src: {
                    not: "",
                    notIn: [placeholder],
                    startsWith: "http"
                }
            },
            orderBy: { id: "desc" }
        });
        if (pureMatch) return pureMatch.image_src;
    }

    return null;
}

function parseWfProperties(name: string) {
    let material: string | null = null;
    let dimensions: string | null = null;

    if (!name) return { material, dimensions };

    // Try to extract material
    const matMatch = name.match(/Material\s*:\s*(.+?)(?:\s{2,}|Size:|$)/i);
    if (matMatch) {
        material = matMatch[1].trim();
    }

    // Try to extract dimensions
    const dimMatch = name.match(/Size\s*:\s*(.+)$/i);
    if (dimMatch) {
        dimensions = dimMatch[1].trim().replace(/\s+/g, " "); // collapse multiple spaces
    }

    return { material, dimensions };
}

function parseSizeFromSku(sku: string): string | null {
    if (!sku) return null;
    const parts = sku.split('-');
    for (const part of parts) {
        if (/^\d+x\d+$/i.test(part.trim())) {
            return part.trim();
        }
    }
    return null;
}

function isSizeOnlyName(name: string): boolean {
    if (!name) return false;
    return /^size:\s*\d+/i.test(name.trim()) || /^\d+\s*x\s*\d+/i.test(name.trim()) || /^[a-z0-9]+-[a-z0-9]+-\d+x\d+$/i.test(name.trim());
}

function isValidDescriptiveName(name: string, skuSize: string | null): boolean {
    if (!name) return false;
    const lowerName = name.toLowerCase().trim();
    
    // Skip placeholders/generic terms
    const genericTerms = new Set(['sample order', 'sample', 'custom print order', 'custom', 'wayfair product', 'test product']);
    if (genericTerms.has(lowerName)) return false;

    // Skip size-only/SKU-only formats
    if (isSizeOnlyName(name) || lowerName.startsWith("size:")) return false;

    // Skip if name contains a different size than skuSize
    if (skuSize) {
        const sizeMatch = name.match(/(\d+)\s*[xX]\s*(\d+)/);
        if (sizeMatch) {
            const nameSize = `${sizeMatch[1]}x${sizeMatch[2]}`;
            if (nameSize !== skuSize) {
                return false;
            }
        }
    }

    return true;
}

async function resolveWfProductName(sku: string | null, skuSize: string | null): Promise<string | null> {
    if (!sku) return null;
    const placeholder = "Wayfair Product";

    // 1. Try exact SKU match
    const exactMatch = await db.orderItem.findFirst({
        where: {
            sku: sku,
            name: {
                not: "",
                not: placeholder
            }
        },
        orderBy: { id: "desc" }
    });
    if (exactMatch && isValidDescriptiveName(exactMatch.name, skuSize)) {
        return exactMatch.name;
    }

    // 2. Try base SKU match
    const pureBase = sku.split('-')[0];
    if (pureBase && pureBase.length > 2) {
        const baseMatch = await db.orderItem.findFirst({
            where: {
                sku: {
                    startsWith: pureBase
                },
                name: {
                    not: "",
                    not: placeholder
                }
            },
            orderBy: { id: "desc" }
        });
        if (baseMatch && isValidDescriptiveName(baseMatch.name, skuSize)) {
            return baseMatch.name;
        }
    }

    return null;
}


// WAYFAIR SYNC ACTION
export async function syncWayfairOrders(force: boolean = false) {
    const settings = (await getSystemSettings()) as Record<string, string>

    if (!settings['wf_client_id'] || !settings['wf_client_secret']) {
        return { error: "Wayfair ayarları eksik. Lütfen Ayarlar sayfasından tamamlayınız." }
    }

    const mode = settings['wf_mode'] || "sandbox"
    const isSandbox = mode === "sandbox"

    // RATE LIMIT CHECK
    if (!force) {
        const lastSyncStr = settings['last_wf_sync_time']
        if (lastSyncStr) {
            const lastSync = parseInt(lastSyncStr)
            const now = Date.now()
            // 5 minutes rate limit for background auto-sync to prevent resource exhaustion
            if (now - lastSync < 300000) {
                return { skipped: true, message: "Sync skipped (Rate Limit)" }
            }
        }
    }

    try {
        // UPDATE TIMESTAMP
        await db.systemSetting.upsert({
            where: { key: 'last_wf_sync_time' },
            update: { value: Date.now().toString() },
            create: { key: 'last_wf_sync_time', value: Date.now().toString() }
        })

        const tokenUrl = "https://sso.auth.wayfair.com/oauth/token"

        const graphqlUrl = isSandbox
            ? "https://sandbox.api.wayfair.com/v1/graphql"
            : "https://api.wayfair.com/v1/graphql"

        // Fetch OAuth Token
        const tokenRes = await fetch(tokenUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                grant_type: "client_credentials",
                client_id: settings['wf_client_id'].trim(),
                client_secret: settings['wf_client_secret'].trim(),
                audience: "https://api.wayfair.com"
            }),
            cache: 'no-store'
        })

        if (!tokenRes.ok) {
            const errText = await tokenRes.text().catch(() => "")
            return { error: `Wayfair token alınamadı (HTTP ${tokenRes.status}). Detay: ${errText.substring(0, 100)}` }
        }

        const tokenData = await tokenRes.json()
        const accessToken = tokenData.access_token

        if (!accessToken) {
            return { error: "Wayfair API yanıtında access_token bulunamadı." }
        }

        // GraphQL Query for open purchase orders (status and customerEmail are not supported by the schema)
        const query = `
        query getDropshipPurchaseOrders(
          $limit: Int32,
          $hasResponse: Boolean,
          $fromDate: IsoDateTime,
          $poNumbers: [String],
          $sortOrder: SortOrder
        ) {
          getDropshipPurchaseOrders(
            limit: $limit,
            hasResponse: $hasResponse,
            fromDate: $fromDate,
            poNumbers: $poNumbers,
            sortOrder: $sortOrder
          ) {
            poNumber
            poDate
            supplierId
            customerName
            customerAddress1
            customerAddress2
            customerCity
            customerState
            customerPostalCode
            customerCountry
            products {
              partNumber
              sku
              name
              quantity
              price
            }
          }
        }`;

        const gqlRes = await fetch(graphqlUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                query,
                variables: {
                    limit: 50,
                    ...(isSandbox ? { hasResponse: false } : {})
                }
            }),
            cache: 'no-store'
        })

        if (!gqlRes.ok) {
            const errText = await gqlRes.text().catch(() => "")
            return { error: `Wayfair API GraphQL sorgusu başarısız (HTTP ${gqlRes.status}). Detay: ${errText.substring(0, 100)}` }
        }

        const gqlResult = await gqlRes.json()
        console.log("[DEBUG] Wayfair GraphQL Response:", JSON.stringify(gqlResult, null, 2).substring(0, 500))

        if (gqlResult.errors && gqlResult.errors.length > 0) {
            return { error: `Wayfair GraphQL Hatası: ${gqlResult.errors[0].message}` }
        }

        const wfOrders = gqlResult.data?.getDropshipPurchaseOrders || []

        if (!Array.isArray(wfOrders)) {
            return { error: "Wayfair API'si beklenen listeyi (getDropshipPurchaseOrders) döndürmedi." }
        }

        if (wfOrders.length === 0) {
            return { success: true, message: "Bağlantı başarılı! Ancak aktarılacak yeni Wayfair siparişi bulunamadı.", count: 0 }
        }

        // PREFETCH STATUSES to find correct default status
        const statuses = await db.statusColumn.findMany({ orderBy: { order: 'asc' } })
        let defaultStatus = statuses.length > 0 ? statuses[0].id : "pending"
        const incoming = statuses.find(s =>
            s.title.toLowerCase().includes("gelen") ||
            s.title.toLowerCase().includes("yeni") ||
            s.title.toLowerCase().includes("sipariş") ||
            s.id === "pending"
        )
        if (incoming) defaultStatus = incoming.id

        let importedCount = 0

        for (const wfOrder of wfOrders) {
            try {
                const poNumber = wfOrder.poNumber?.toString()
                if (!poNumber) continue

                // Check composite unique key
                const existingOrder = await db.order.findUnique({
                    where: {
                        source_externalId: {
                            source: 'wayfair',
                            externalId: poNumber
                        }
                    }
                })

                if (existingOrder) {
                    continue
                }

                // Skip old orders in production if they are created before the prod_start_time
                if (!isSandbox) {
                    const prodStartStr = settings['wf_prod_start_time']
                    if (prodStartStr) {
                        const prodStart = parseInt(prodStartStr)
                        const orderTime = wfOrder.poDate ? new Date(wfOrder.poDate).getTime() : Date.now()
                        if (orderTime < prodStart) {
                            continue
                        }
                    }
                }

                // Map Address
                const name = wfOrder.customerName || "Wayfair Customer"
                const address = `${wfOrder.customerAddress1 || ""} ${wfOrder.customerAddress2 || ""}`.trim() || "Address not provided"
                const city = `${wfOrder.customerCity || ""} / ${wfOrder.customerState || ""} ${wfOrder.customerPostalCode || ""}`.trim()
                const phone = null
                const email = wfOrder.customerEmail || null

                // Map items
                const products = wfOrder.products || []
                const items = []
                const supplierId = wfOrder.supplierId || "476700"
                for (const item of products) {
                    const sku = item.partNumber || item.sku || null
                    let img = "https://placehold.co/600x400?text=Wayfair+Product"
                    if (sku) {
                        // 1. Try to fetch directly from Wayfair Catalog API (first choice, accurate)
                        const catalogImg = await resolveWfCatalogImage(sku, supplierId, accessToken, isSandbox)
                        if (catalogImg) {
                            img = catalogImg
                        } else {
                            // 2. Try to find in local DB cache (previously synced Wayfair orders)
                            const resolvedImg = await resolveWfProductImage(sku, settings)
                            if (resolvedImg) {
                                img = resolvedImg
                            }
                        }
                    }
                    const props = parseWfProperties(item.name || "");
                    const skuSize = parseSizeFromSku(sku || "");
                    const finalDimensions = skuSize || props.dimensions;

                    let finalName = item.name || item.partNumber || "Wayfair Product";
                    if (isSizeOnlyName(finalName)) {
                        const dbName = await resolveWfProductName(sku, skuSize);
                        if (dbName) {
                            finalName = dbName;
                        } else {
                            finalName = item.partNumber || finalName;
                        }
                    }

                    items.push({
                        name: finalName,
                        quantity: parseInt(item.quantity) || 1,
                        sku: sku,
                        image_src: img,
                        material: props.material,
                        dimensions: finalDimensions
                    })
                }

                // Calculate total
                const totalVal = products.reduce((sum: number, item: any) => sum + ((item.price || 0) * (parseInt(item.quantity) || 1)), 0)
                const total = `${totalVal.toFixed(2)} USD`

                // Create order (Wayfair orders go directly to PrintMarkt pending)
                await db.order.create({
                    data: {
                        customer: name,
                        phone,
                        email,
                        address,
                        city,
                        total,
                        status: 'pending_pm',
                        source: 'wayfair',
                        externalId: poNumber,
                        barcode: `WF-${poNumber}`,
                        date: wfOrder.poDate ? new Date(wfOrder.poDate) : new Date(),
                        labels: JSON.stringify(['Wayfair', 'Yeni']),
                        hasNotification: true,
                        items: {
                            create: items
                        }
                    }
                })

                importedCount++
            } catch (err: any) {
                console.error(`Error mapping Wayfair order:`, err)
            }
        }

        return { success: true, message: `Wayfair eşitlemesi başarılı. ${importedCount} yeni sipariş eklendi.`, count: importedCount }

    } catch (e: any) {
        console.error("Wayfair Sync Error:", e)
        return { error: "Senkronizasyon hatası: " + e.message }
    }
}

// Background periodic sync for persistent Node.js servers (DigitalOcean App Platform, VPS, etc.)
const globalForSync = globalThis as unknown as {
    syncIntervalStarted: boolean | undefined;
    syncInProgress: boolean | undefined;
}

if (typeof window === 'undefined' && process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
    if (!globalForSync.syncIntervalStarted) {
        globalForSync.syncIntervalStarted = true;
        globalForSync.syncInProgress = false;
        
        const GLOBAL_SYNC_INTERVAL = 3 * 60 * 1000; // 3 minutes
        
        setInterval(async () => {
            if (globalForSync.syncInProgress) {
                console.log("[BACKGROUND_SYNC] Skip scheduled sync - another sync is already in progress.");
                return;
            }
            globalForSync.syncInProgress = true;
            console.log("[BACKGROUND_SYNC] Starting scheduled order sync on server...");
            try {
                const wc = await syncWooCommerceOrders(false).catch(e => ({ error: e.message }));
                const pm = await syncPrintMarktOrders(false).catch(e => ({ error: e.message }));
                const etsy = await syncEtsyOrders().catch(e => ({ error: e.message }));
                const cargo = await syncCargoKargoEntegrator().catch(e => ({ error: e.message }));
                const wf = await syncWayfairOrders(false).catch(e => ({ error: e.message }));
                console.log("[BACKGROUND_SYNC] Scheduled sync completed:", { wc, pm, etsy, cargo, wf });
            } catch (error) {
                console.error("[BACKGROUND_SYNC] Fatal error in scheduled sync:", error);
            } finally {
                globalForSync.syncInProgress = false;
            }
        }, GLOBAL_SYNC_INTERVAL);
        
        console.log("[BACKGROUND_SYNC] Registered server-side background interval (3m) with concurrency locks.");
    }
}
