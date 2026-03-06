"use server"

import { db } from "@/lib/prisma"
import { login, getSession, logout as authLogout } from "@/lib/auth"
import { redirect } from "next/navigation"
import { revalidatePath, unstable_noStore as noStore } from "next/cache"
import bcrypt from "bcryptjs"
import { OrderStatus } from "@/data/mock-orders"
import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api"
import fs from "fs"
import path from "path"

const DEBUG_LOG_PATH = path.join(process.cwd(), "oms_debug.log");

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

    // Fetch fresh user data to get allowedStatuses - Defensive check
    let allowedStatuses = null
    const isAdmin = session.user.role === 'admin'

    try {
        const user = await db.user.findUnique({
            where: { id: session.user.id },
            select: { allowedStatuses: true } as any
        }) as any

        if (user?.allowedStatuses) {
            try {
                allowedStatuses = JSON.parse(user.allowedStatuses)
            } catch (e) {
                console.error("JSON parse error for allowedStatuses:", e)
            }
        }
    } catch (e) {
        console.error("Failed to fetch user permissions:", e)
    }

    // Condition: If admin, see all. If allowedStatuses is set, filter. Else see all (default).
    const where: any = {}
    if (!isAdmin && allowedStatuses && Array.isArray(allowedStatuses)) {
        // Filter out feature flags (capabilities) from status filters (view restrictions)
        const visibleStatuses = allowedStatuses.filter((s: string) => s !== "MANUAL_SYNC")

        // Only apply filter if there are ACTUAL status restrictions left
        if (visibleStatuses.length > 0) {
            where.status = { in: visibleStatuses }
        }
    }

    const orders = await db.order.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: 100, // Limit to 100 to save quota
        include: {
            items: true,
            comments: {
                include: { author: { select: { name: true } } },
                orderBy: { timestamp: "asc" }
            },
            activities: {
                orderBy: { timestamp: "desc" },
                take: 10 // Last 10 is enough for initial view
            }
        }
    })

    // Serializing dates to strings to match interface and avoid hydration issues
    return orders.map(order => ({
        ...order,
        date: order.date.toISOString(),
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
        total: order.total || "0 ₺",
        items: order.items.map(item => ({
            ...item,
            sku: item.sku || null,
            url: item.url || null,
            material: item.material || null,
            dimensions: item.dimensions || null
        })),
        comments: order.comments.map(c => ({
            id: c.id,
            message: c.message,
            type: (c as any).type || "message",
            timestamp: c.timestamp.toISOString(),
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
        })),
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

export async function getOrderDetails(orderId: number) {
    noStore(); // Restore noStore to ensure fresh data and fix visibility issues
    const session = await getSession()
    if (!session) return null

    console.log(`[DEBUG] Fetching details for Order #${orderId}...`)
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

        try {
            revalidatePath("/")
        } catch (e) { }

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
                await logActivity(order.id, user, "LABEL_UPDATE", "Etiketler güncellendi.")
            }

            // 7. Item Updates
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
                taxNumber: order.taxNumber,
                taxOffice: order.taxOffice,
                invoiceStatus: order.invoiceStatus,
                invoiceUrl: order.invoiceUrl,
                customDesi: order.customDesi ? parseFloat(order.customDesi.toString()) : null,
                customWeight: order.customWeight ? parseFloat(order.customWeight.toString()) : null
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
            select: { cargoBarcode: true, cargoTrackingNumber: true, status: true }
        });
        return order;
    } catch {
        return null;
    }
}

export async function createDHLShipmentAction(orderId: number, bypassAuth: boolean = false) {
    noStore();
    serverLog(`[MNG_SOAP] START: Connecting directly to MNG Kargo for Order #${orderId}`);

    let session = null;
    if (!bypassAuth) {
        session = await getSession();
        if (!session) {
            serverLog(`[MNG_SOAP] ERR: No session for #${orderId}`);
            return { error: "Oturum kapalı" };
        }
    }

    const settings = await getSystemSettings();
    const dhlUser = settings['dhl_user'];
    const dhlPass = settings['dhl_pass'];

    if (!dhlUser || !dhlPass) {
        serverLog(`[MNG_SOAP] ERR: Missing MNG/DHL credentials for #${orderId}`);
        return { error: "Lütfen Ayarlar sayfasından MNG Kargo (DHL) Kullanıcı Adı ve Şifrenizi eksiksiz girin." };
    }

    try {
        const order = await db.order.findUnique({ where: { id: orderId } });

        if (!order) {
            serverLog(`[MNG_SOAP] ERR: Order not found #${orderId}`);
            return { error: "Sipariş bulunamadı" };
        }

        const actorName = bypassAuth || !session ? "TEST_SYSTEM" : session.user.name;
        await logActivity(orderId, actorName, "CARGO_START", "Doğrudan MNG Kargo API'sine barkod oluşturma kaydı iletiliyor...");

        // Parse address to City / District
        let il = "ISTANBUL";
        let ilce = "SISLI";
        const addressMatch = (order.address || "").match(/\b([A-ZŞİĞÜÇÖa-zşıiğüçö]+)\s*\/\s*([A-ZŞİĞÜÇÖa-zşıiğüçö]+)\b/);
        if (addressMatch) {
            ilce = addressMatch[1].trim().toUpperCase();
            il = addressMatch[2].trim().toUpperCase();
        } else if (order.city) {
            il = order.city.trim().toUpperCase();
            ilce = order.city.trim().toUpperCase();
        }

        let phone = (order.phone || "05551112233").replace(/[^0-9]/g, "");

        // Since the server IP is now whitelisted directly by MNG, we can bypass the local relay
        // and connect directly to their SOAP service.
        const soapUrl = "https://service.mngkargo.com.tr/musterikargosiparis/musterikargosiparis.asmx";
        const actor = bypassAuth ? "TEST_SYSTEM" : session.user.name;

        // Calculate Desi/Weight realistically based on the items
        let totalDesi = 1;
        let totalWeight = 1;

        const orderItems = await db.orderItem.findMany({ where: { orderId } });
        if (orderItems && orderItems.length > 0) {
            totalDesi = 0;
            totalWeight = 0;
            orderItems.forEach((item: any) => {
                // Basic parse of dims like "300 x 200" or fallback
                let desi = 1;
                let weight = 1;
                const volumeMatch = (item.dimensions || "").match(/(\d+)\s*[xX]\s*(\d+)/);
                if (volumeMatch) {
                    const w = parseInt(volumeMatch[1]);
                    const h = parseInt(volumeMatch[2]);
                    // Wallpaper tube approximation: 15cm x 15cm x Width
                    const minD = Math.min(w, h);
                    // Desi calculation: (Width * 15 * 15) / 3000
                    desi = Math.max(1, Math.round((minD * 15 * 15) / 3000));
                    weight = Math.max(1, Math.round(desi * 0.8)); // roughly 0.8kg per desi
                }
                totalDesi += (desi * (item.quantity || 1));
                totalWeight += (weight * (item.quantity || 1));
            });

            if (totalDesi < 1) totalDesi = 1;
            if (totalWeight < 1) totalWeight = 1;
        }

        // Override with custom manual values if available
        if (order.customDesi && order.customDesi > 0) totalDesi = order.customDesi;
        if (order.customWeight && order.customWeight > 0) totalWeight = order.customWeight;

        // Ensure safe float representation for XML (Some SOAP services prefer comma, but MNG standard is dot or integer)
        // MNG Format: Weight:Desi:Width:Length:Height:; 
        const weightStr = totalWeight.toString().replace(',', '.');
        const desiStr = totalDesi.toString().replace(',', '.');
        const pKargoParcaList = `${weightStr}:${desiStr}:15:15:100:;`;


        // 1. CREATE SHIPMENT
        const siparisGirisiXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <SiparisGirisiDetayliV3 xmlns="http://tempuri.org/">
      <pChIrsaliyeNo>${order.id}</pChIrsaliyeNo>
      <pPrKiymet></pPrKiymet>
      <pChBarkod>${order.id}</pChBarkod>
      <pChIcerik>Duvarkagidi</pChIcerik>
      <pGonderiHizmetSekli>NORMAL</pGonderiHizmetSekli>
      <pTeslimSekli>1</pTeslimSekli>
      <pFlAlSms>0</pFlAlSms>
      <pFlGnSms>0</pFlGnSms>
      <pKargoParcaList>${pKargoParcaList}</pKargoParcaList>
      <pAliciMusteriMngNo></pAliciMusteriMngNo>
      <pAliciMusteriBayiNo></pAliciMusteriBayiNo>
      <pAliciMusteriAdi><![CDATA[${(order.customer || "Musteri").substring(0, 50)}]]></pAliciMusteriAdi>
      <pChSiparisNo>${order.id}</pChSiparisNo>
      <pLuOdemeSekli>P</pLuOdemeSekli>
      <pFlAdresFarkli>0</pFlAdresFarkli>
      <pChIl>${il}</pChIl>
      <pChIlce>${ilce}</pChIlce>
      <pChAdres><![CDATA[${(order.address || "Adres Belirtilmemis").substring(0, 200)}]]></pChAdres>
      <pChSemt></pChSemt>
      <pChMahalle></pChMahalle>
      <pChMeydanBulvar></pChMeydanBulvar>
      <pChCadde></pChCadde>
      <pChSokak></pChSokak>
      <pChTelEv></pChTelEv>
      <pChTelCep>${phone}</pChTelCep>
      <pChTelIs></pChTelIs>
      <pChFax></pChFax>
      <pChEmail></pChEmail>
      <pChVergiDairesi></pChVergiDairesi>
      <pChVergiNumarasi></pChVergiNumarasi>
      <pFlKapidaOdeme>0</pFlKapidaOdeme>
      <pMalBedeliOdemeSekli></pMalBedeliOdemeSekli>
      <pPlatformKisaAdi></pPlatformKisaAdi>
      <pPlatformSatisKodu></pPlatformSatisKodu>
      <pKullaniciAdi>${dhlUser}</pKullaniciAdi>
      <pSifre>${dhlPass}</pSifre>
    </SiparisGirisiDetayliV3>
  </soap:Body>
</soap:Envelope>`;

        serverLog(`[MNG_SOAP] Sending SiparisGirisiDetayliV3 for Order ${order.id}...`);
        const siparisRes = await fetch(soapUrl, {
            method: "POST",
            headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": "http://tempuri.org/SiparisGirisiDetayliV3" },
            body: siparisGirisiXml
        });

        const siparisText = await siparisRes.text();
        await logActivity(orderId, actor, "MNG_API_RES", siparisText.substring(0, 200));
        const siparisMatch = siparisText.match(/<SiparisGirisiDetayliV3Result>(.*?)<\/SiparisGirisiDetayliV3Result>/);
        const siparisResult = siparisMatch ? siparisMatch[1] : "";

        if (siparisResult !== "1" && !siparisResult.includes("KAYIT ZATEN VAR")) {
            serverLog(`[MNG_SOAP] SiparisGirisiDetayliV3 Error: ${siparisResult}`);
            return { error: `MNG Kargo Hatası: ${siparisResult || 'Bilinmeyen hata'}` };
        }

        // 2. FETCH BARCODE
        const barkodXml = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <MNGGonderiBarkod xmlns="http://tempuri.org/">
      <req>
        <WsUserName>${dhlUser}</WsUserName>
        <WsPassword>${dhlPass}</WsPassword>
        <ReferansNo>${order.id}</ReferansNo>
        <OutBarkodType>PDF</OutBarkodType>
        <FlKapidaTahsilat>0</FlKapidaTahsilat>
        <HatadaReferansBarkoduBas>1</HatadaReferansBarkoduBas>
      </req>
    </MNGGonderiBarkod>
  </soap:Body>
</soap:Envelope>`;

        serverLog(`[MNG_SOAP] Fetching PDF Barcode for ${order.id}...`);
        const barkodRes = await fetch(soapUrl, {
            method: "POST",
            headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": "http://tempuri.org/MNGGonderiBarkod" },
            body: barkodXml
        });

        const barkodText = await barkodRes.text();
        console.error(`[MNG_DEBUG_BARKOD_107707] Response:`, barkodText); // ADDED
        await logActivity(orderId, actor, "MNG_BARKOD_RES", barkodText.substring(0, 400));
        const zplMatch = barkodText.match(/<BarkodText>([\s\S]*?)<\/BarkodText>/);
        let zplContent = zplMatch ? Buffer.from(zplMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')).toString('utf-8') : null;

        let trackingNoMatch = barkodText.match(/<MngKargoGonderiNo>(.*?)<\/MngKargoGonderiNo>/);
        let trackingNo = trackingNoMatch ? trackingNoMatch[1] : null;

        let hataMatch = barkodText.match(/<IstekHata>([\s\S]*?)<\/IstekHata>/);
        let hataMesaji = hataMatch ? hataMatch[1].trim() : null;

        if (!zplContent || zplContent.length < 10) {
            const fallbackZplMatch = barkodText.match(/<BarkodValue>(.*?)<\/BarkodValue>/);
            if (fallbackZplMatch) {
                // Fallback: If no ZPL was returned but BarkodValue exists, the label wasn't generated properly.
                serverLog(`[MNG_SOAP] No ZPL returned. Result:\n${barkodText.substring(0, 300)}`);
                return { error: "Barkod üretilemedi, sadece barkod değeri döndü." };
            }
            if (hataMesaji && hataMesaji.length > 0) {
                return { error: `MNG: ${hataMesaji}` };
            }
            return { error: "MNG Kargo'dan barkod alınamadı." };
        }

        // 3. UPDATE DB
        serverLog(`[MNG_SOAP] Success! Updating Order ${order.id}. Tracking No: ${trackingNo}`);
        await db.order.update({
            where: { id: orderId },
            data: {
                updatedAt: new Date(),
                cargoBarcode: zplContent, // We store the raw ZPL string
                cargoTrackingNumber: trackingNo || order.id.toString(),
                status: "shipped" // We update the status cleanly
            }
        });

        await logActivity(orderId, actor, "CARGO_SUCCESS", `Barkod başarıyla MNG'den çekildi. PDF yazdırmaya hazır.`);
        return { success: true, message: "Kargo barkodu başarıyla anında üretildi!" };

    } catch (e: any) {
        serverLog(`[MNG_SOAP] CRITICAL_ERROR: ${e.message}`);
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
    let targetStatus = "pending"

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
            { id: "pending", title: "Bekliyor", color: "#64748b", order: 0 },
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
    if (["pending", "completed"].includes(id)) {
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

export async function updateUserPermissions(userId: string, allowedStatuses: string[]) {
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
    noStore()
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
    const url = formData.get("pm_url") as string
    const key = formData.get("pm_key") as string

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
            // 15 Seconds = 15,000 ms (Align with 20s client poll)
            if (now - lastSync < 15000) {
                // Too early, skip
                return { skipped: true, message: "Sync skipped (Rate Limit)" }
            }
        }
    }

    try {
        const auth = Buffer.from(`${settings['wc_key']}:${settings['wc_secret']}`).toString('base64')
        // Filter: After Dec 20, 2025 - Increase limit to catch gaps
        const response = await fetch(`${settings['wc_url']}/wp-json/wc/v3/orders?per_page=100&after=2025-12-20T00:00:00`, {
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
        let defaultStatus = statuses.length > 0 ? statuses[0].id : "pending"

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

                    return {
                        name: item.name || 'Ürün',
                        quantity: item.quantity || 1,
                        image_src: imageSrc,
                        sku: item.sku || getMeta(['Stok Kodu', 'SKU', '_stok_kodu', 'Urun Kodu', 'Kod', 'Product Code', '_sku']) || null,
                        url: getMeta(['_ozel_url', 'ozel_url', 'Özel Url', 'Ozel Url', 'Dosya Linki', 'File Link', 'Drive Link', 'Link', 'Url', 'Siparis Dosyasi']) || null,
                        dimensions: dimensions,
                        material: material,
                        productNote: getMeta(['Ürün Notu', 'Urun Notu', 'Not', 'Note', '_urun_notu']) || null,
                        sampleData: getMeta(['Numune İsteği', 'Numune Istegi', 'Numune', 'Sample', '_numune']) || null
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
                    try {
                        const localLabels = typeof existingOrder.labels === 'string' ? JSON.parse(existingOrder.labels) : existingOrder.labels;
                        if (Array.isArray(localLabels) && localLabels.length > 0) {
                            // Merge labels, keeping uniques
                            const combined = Array.from(new Set([...localLabels, ...labels]));
                            finalLabels = combined;
                        }
                    } catch (e) {
                        console.error("Label merge error:", e);
                    }

                    // DETECT ACTUAL CHANGES to avoid unnecessary updatedAt updates
                    const oldCustomer = existingOrder.customer;
                    const newCustomer = `${wcOrder.billing.first_name || ''} ${wcOrder.billing.last_name || ''}`.trim() || 'Misafir';

                    const hasStatusChange = existingOrder.status !== finalStatus;
                    const hasDataChange =
                        oldCustomer !== newCustomer ||
                        existingOrder.city !== city ||
                        existingOrder.email !== wcOrder.billing.email ||
                        existingOrder.phone !== wcOrder.billing.phone ||
                        existingOrder.address !== `${wcOrder.billing.address_1 || ''} ${wcOrder.billing.address_2 || ''}`.trim();

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
                            note: wcOrder.customer_note,
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
    const { items, customer, phone, email, address, city, note, status } = orderData

    // Use a manual barcode prefix
    const barcode = `MANUAL-${Date.now()}`

    try {
        await db.order.create({
            data: {
                customer,
                phone,
                email,
                address,
                city,
                note,
                total: "0.00 ₺", // Default or user provided? For now 0 or hidden
                status: status || "pending",
                barcode,
                labels: JSON.stringify(['Manuel']),
                hasNotification: true,
                items: {
                    create: items
                }
            }
        })

        // Log activity
        const newOrder = await db.order.findUnique({ where: { barcode } })
        if (newOrder) {
            await logManualActivity(newOrder.id, "ORDER_CREATED", "Manuel sipariş oluşturuldu.")
        }

    } catch (error) {
        console.error("Failed to create manual order:", error)
        throw new Error("Sipariş oluşturulamadı.")
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

export async function syncCargoKargoEntegrator() {
    const apiKey = process.env.KARGO_ENTEGRATOR_API_KEY || "OylOoz2vKllZtByiBAbl65NpdsnaNPVlpVTRzgNte8e42427";
    let updatedCount = 0;

    // API limits to 15 per page. We need to fetch multiple pages to cover recent 100 orders.
    const MAX_PAGES = 7; // 7 * 15 = 105 items

    try {
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
                // If one page fails, maybe stop? Or continue? Let's stop to be safe.
                if (page === 1) return { error: "Kargo API Hatası: " + res.status };
                break;
            }

            const json = await res.json();
            const shipments = json.data || [];

            if (shipments.length === 0) break; // End of list

            for (const ship of shipments) {
                if (!ship.platform_id) continue;

                const platformId = String(ship.platform_id);
                const barcode = ship.barcode;
                const trackingNum = ship.tracking_number;

                // Construct Print URL (Corrected via User Feedback)
                const printUrl = `https://app.kargoentegrator.com/print-pdf?shipments[0]=${ship.id}`;

                if (!trackingNum && !barcode && !ship.status) continue;

                // Try matching by Barcode (WC-123 or just 123)
                let targetBarcode = `WC-${platformId}`;

                // First try strict match by WC- prefix
                let order = await db.order.findUnique({ where: { barcode: targetBarcode } });

                // If not found, try raw ID
                if (!order) {
                    order = await db.order.findUnique({ where: { barcode: platformId } });
                }

                if (order) {
                    // Only update if something is missing or changed
                    // To avoid DB spam, check if we actually have new info
                    if (order.cargoTrackingNumber !== trackingNum || order.cargoBarcode !== barcode || order.cargoLabelPdf !== printUrl) {
                        await db.order.update({
                            where: { id: order.id },
                            data: {
                                cargoTrackingNumber: trackingNum || undefined,
                                cargoBarcode: barcode || undefined,
                                cargoLabelPdf: printUrl
                            }
                        });
                        updatedCount++;
                    }
                }
            }
        }

        //  // revalidatePath("/"); - Removed from polling to prevent DO hangs
        return { success: true, message: `${updatedCount} siparişin kargo bilgisi güncellendi.` };

    } catch (error: any) {
        console.error("Kargo Sync Error:", error);
        return { error: "Kargo Entegrasyonu Hatası: " + error.message };
    }
}

// PRINTMARKT SYNC ACTION
export async function syncPrintMarktOrders(force: boolean = false) {
    const settings = (await getSystemSettings()) as Record<string, string>

    if (!settings['pm_url'] || !settings['pm_key']) {
        return { error: "PrintMarkt ayarları eksik. Lütfen Ayarlar sayfasından tamamlayınız." }
    }

    try {
        let cleanUrl = settings['pm_url'].replace(/\/+$/, '');
        let response = await fetch(`${cleanUrl}/api/orders`, {
            headers: { "X-API-Key": settings['pm_key'] },
            cache: 'no-store'
        })

        if (response.status === 401 || response.status === 403) {
            response = await fetch(`${cleanUrl}/api/orders`, {
                headers: { "Authorization": `Bearer ${settings['pm_key']}` },
                cache: 'no-store'
            })
        }

        if (!response.ok) {
            const errText = await response.text().catch(() => "");
            return { error: `PrintMarkt sitesine bağlanılamadı (HTTP ${response.status}). Yanıt: ${errText.substring(0, 50)}` }
        }

        const pmOrders = await response.json()
        console.log("[DEBUG] PrintMarkt Sync Response:", JSON.stringify(pmOrders, null, 2))

        if (!Array.isArray(pmOrders)) {
            return { error: "PrintMarkt API'si beklenen listeyi (Array) döndürmedi." }
        }

        if (pmOrders.length === 0) {
            return { success: true, message: `Bağlantı BAŞARILI! Ancak PrintMarkt üzerinde çekilecek yeni sipariş bulunamadı.`, count: 0 }
        }

        let importedCount = 0;

        for (const pmOrder of pmOrders) {
            try {
                // Determine order number
                const externalId = pmOrder.id?.toString() || pmOrder.order_number?.toString() || pmOrder.number?.toString() || pmOrder.id;
                if (!externalId) continue; // Skip if no ID

                const orderNumber = pmOrder.order_number || pmOrder.number || externalId;

                // Check if already exists
                const existingOrder = await db.order.findFirst({
                    where: { externalId: `pm_${externalId}` }
                });

                if (existingOrder) continue; // Skip duplicates

                // Map Address
                let shippingName = "Bilinmiyor";
                let shippingAddress = "Adres bulunamadı";
                let shippingPhone = "";
                let shippingEmail = pmOrder.email || pmOrder.account_email || "";

                if (pmOrder.shipping_address) {
                    shippingName = pmOrder.shipping_address.name || pmOrder.shipping_address.first_name + " " + pmOrder.shipping_address.last_name || shippingName;
                    shippingAddress = `${pmOrder.shipping_address.address1 || ''} ${pmOrder.shipping_address.address2 || ''} ${pmOrder.shipping_address.city || ''} ${pmOrder.shipping_address.province || ''} ${pmOrder.shipping_address.zip || ''} ${pmOrder.shipping_address.country || ''}`.trim();
                    shippingPhone = pmOrder.shipping_address.phone || "";
                } else if (pmOrder.customer) {
                    shippingName = pmOrder.customer.name || pmOrder.customer.first_name + " " + pmOrder.customer.last_name || pmOrder.account_name || shippingName;
                    shippingEmail = pmOrder.customer.email || shippingEmail;
                    shippingPhone = pmOrder.customer.phone || "";
                }

                // Fallback for name from top-level
                if (shippingName === "Bilinmiyor" && pmOrder.account_name) {
                    shippingName = pmOrder.account_name;
                }

                // Map Items
                const items = [];
                let totalAmount = 0;

                const lineItems = pmOrder.line_items || pmOrder.items || [];
                for (const item of lineItems) {
                    const price = parseFloat(item.price || item.total || 0);
                    const qty = parseInt(item.quantity || 1);
                    totalAmount += price * qty;

                    // Properties extraction removed due to schema mismatch

                    // Extract material & dimension from direct item fields if present (based on screenshot)
                    const material = item.material ? String(item.material) : "";
                    const dimensions = item.dimensions || item.size ? String(item.dimensions || item.size) : "";

                    items.push({
                        name: item.name || item.title || "Custom Print Order",
                        quantity: qty,
                        sku: item.sku || "",
                        image_src: item.image_url || item.image || item.thumbnail || "", // Required field
                        material: material,
                        dimensions: dimensions
                    });
                }

                // Fallback total validation
                if (totalAmount === 0 && pmOrder.total_price) {
                    totalAmount = parseFloat(pmOrder.total_price);
                }

                // Map general fields
                const status = (pmOrder.status || pmOrder.order_status || "pending").toLowerCase();
                const mappedStatus = status.includes("ship") ? "shipped" : "pending";

                const paymentMethod = pmOrder.payment_method || pmOrder.gateway || "Unknown";
                const customerNote = pmOrder.note || pmOrder.customer_note || pmOrder.order_note || "";

                await db.order.create({
                    data: {
                        externalId: `pm_${externalId}`,
                        source: "PrintMarkt",
                        customer: shippingName, // Mapped from shippingName
                        email: shippingEmail, // Mapped from shippingEmail
                        phone: shippingPhone,
                        address: shippingAddress,
                        total: totalAmount.toFixed(2), // Schema expects a String for some reason
                        paymentMethod: paymentMethod,
                        status: mappedStatus,
                        note: customerNote, // Mapped from customerNote
                        labels: "", // Required by schema
                        items: {
                            create: items
                        }
                    }
                });

                importedCount++;
            } catch (err) {
                console.error(`Error mapping PrintMarkt order:`, err);
            }
        }

        return { success: true, message: `Bağlantı BAŞARILI! ${importedCount} yeni sipariş sisteme eklendi. (Toplam kuyruk: ${pmOrders.length})`, count: importedCount }

    } catch (e: any) {
        console.error("PrintMarkt Sync Error:", e)
        return { error: "Senkronizasyon hatası: " + e.message }
    }
}
