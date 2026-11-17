import { db } from './prisma';

export interface FaireOrderItem {
    id: string;
    order_id?: string;
    product_id?: string;
    product_variant_id?: string;
    sku?: string;
    name: string;
    option_name?: string;
    quantity: number;
    price_cents?: number;
    wholesale_price_cents?: number;
    product?: {
        id?: string;
        name?: string;
        images?: Array<{ id?: string; url: string }>;
    };
    product_variant_image_url?: string;
    image_url?: string;
    sku_options?: Array<{ name: string; value: string }>;
    [key: string]: any;
}

export interface FaireAddress {
    name?: string;
    company_name?: string;
    address1?: string;
    address2?: string;
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    zip?: string;
    country?: string;
    country_code?: string;
    phone_number?: string;
    phone?: string;
    [key: string]: any;
}

export interface FaireOrder {
    id: string;
    display_id?: string;
    created_at?: string;
    updated_at?: string;
    state?: string; // NEW, PROCESSING, PRE_TRANSIT, IN_TRANSIT, DELIVERED, CANCELED, BACKORDERED
    payment_state?: string;
    shipment_state?: string;
    currency?: string;
    payout_costs?: {
        payout_fee_cents?: number;
        commission_cents?: number;
    };
    retailer?: {
        id?: string;
        name?: string;
        email?: string;
    };
    address?: FaireAddress;
    shipping_address?: FaireAddress;
    items?: FaireOrderItem[];
    tracking_code?: string;
    tracking_url?: string;
    carrier?: string;
    [key: string]: any;
}

const FAIRE_API_BASE_URL = "https://www.faire.com/external-api/v2";

/**
 * Test Faire API credentials
 */
export async function testFaireConnection(apiToken: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const token = apiToken?.trim();
    if (!token) {
        return { success: false, error: "Faire API Access Token eksik." };
    }

    try {
        const res = await fetch(`${FAIRE_API_BASE_URL}/orders?limit=1`, {
            method: "GET",
            headers: {
                "X-FAIRE-ACCESS-TOKEN": token,
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            cache: 'no-store'
        });

        if (res.ok) {
            return { success: true, message: "Faire API bağlantısı başarılı! Erişim anahtarı doğrulandı." };
        }

        const errText = await res.text().catch(() => "");
        if (res.status === 401 || res.status === 403) {
            return {
                success: false,
                error: `Faire Yetkilendirme Hatası (${res.status}): API Token hatalı veya süresi dolmuş. Lütfen Faire Brand Portal'dan kontrol ediniz.`
            };
        }

        return {
            success: false,
            error: `Faire API Hatası (HTTP ${res.status}): ${errText.substring(0, 150)}`
        };
    } catch (e: any) {
        return { success: false, error: `Faire bağlantı hatası: ${e.message}` };
    }
}

/**
 * Fetch Product Images in batch or individually from Faire Product API
 */
export async function fetchFaireProductImages(
    apiToken: string,
    productIds: string[]
): Promise<Map<string, string>> {
    const imageMap = new Map<string, string>();
    if (!productIds || productIds.length === 0) return imageMap;

    const uniqueProductIds = Array.from(new Set(productIds.filter(Boolean)));

    for (const productId of uniqueProductIds) {
        try {
            const res = await fetch(`${FAIRE_API_BASE_URL}/products/${productId}`, {
                method: "GET",
                headers: {
                    "X-FAIRE-ACCESS-TOKEN": apiToken.trim(),
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                cache: 'no-store'
            });

            if (res.ok) {
                const prodData: any = await res.json();
                const images = prodData.images || prodData.product?.images || [];
                const imgUrl = images[0]?.url || images[0]?.thumbnail || "";
                if (imgUrl) {
                    imageMap.set(productId, imgUrl);
                }
            }
        } catch (err) {
            console.warn(`[FAIRE_PRODUCT_IMAGE_ERR] Product #${productId}:`, err);
        }
    }

    return imageMap;
}

/**
 * Fetch Orders from Faire API
 */
export async function fetchFaireOrders(
    apiToken: string,
    options?: { limit?: number; page?: number }
): Promise<{ orders: FaireOrder[]; error?: string }> {
    const token = apiToken?.trim();
    if (!token) {
        return { orders: [], error: "Faire API Token eksik." };
    }

    const limit = options?.limit || 50;
    const page = options?.page || 1;

    try {
        const res = await fetch(`${FAIRE_API_BASE_URL}/orders?limit=${limit}&page=${page}`, {
            method: "GET",
            headers: {
                "X-FAIRE-ACCESS-TOKEN": token,
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            cache: 'no-store'
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => "");
            return {
                orders: [],
                error: `Faire API hatası (${res.status}): ${errText.substring(0, 150)}`
            };
        }

        const data: any = await res.json();
        const orders: FaireOrder[] = data.orders || (Array.isArray(data) ? data : []);
        return { orders };
    } catch (e: any) {
        return { orders: [], error: `Faire siparişleri çekilemedi: ${e.message}` };
    }
}

/**
 * Upsert a Faire Order into database
 */
export async function upsertFaireOrder(
    order: FaireOrder,
    options: {
        defaultStatus: string;
        imageMap?: Map<string, string>;
    }
): Promise<{ success: boolean; isNew: boolean; error?: string }> {
    const orderId = order.id;
    const displayId = order.display_id || order.id;

    if (!orderId) {
        return { success: false, isNew: false, error: "Sipariş ID bulunamadı." };
    }

    // Customer & Address Info
    const addr = order.shipping_address || order.address || {};
    const customerName =
        addr.name ||
        addr.company_name ||
        order.retailer?.name ||
        `Faire Perakendecisi #${displayId}`;

    const customerPhone = addr.phone_number || addr.phone || null;
    const customerEmail = order.retailer?.email || null;

    // Address parts
    const addressParts: string[] = [];
    const street1 = addr.address1 || addr.address_1;
    const street2 = addr.address2 || addr.address_2;
    if (addr.company_name && addr.company_name !== customerName) addressParts.push(addr.company_name);
    if (street1) addressParts.push(street1);
    if (street2) addressParts.push(street2);
    if (addr.state) addressParts.push(addr.state);
    const zipCode = addr.postal_code || addr.zip;
    if (zipCode) addressParts.push(zipCode);
    const country = addr.country_code || addr.country;
    if (country) addressParts.push(country);

    const fullAddress = addressParts.join(", ") || "Faire Teslimat Adresi";
    const city = addr.city || (country ? `${country} / Faire` : "Faire");

    // Items & Pricing
    let totalCents = 0;
    const items = (order.items || []).map((item) => {
        const qty = item.quantity || 1;
        const priceCents = item.price_cents || item.wholesale_price_cents || 0;
        totalCents += priceCents * qty;

        const sku = item.sku || (item.product_variant_id ? String(item.product_variant_id) : null);
        
        // Resolve product image
        const directImage =
            item.product?.images?.[0]?.url ||
            item.product_variant_image_url ||
            item.image_url;

        const resolvedImage =
            directImage ||
            (item.product_id && options.imageMap?.get(item.product_id)) ||
            "https://placehold.co/600x400?text=Faire+Urun";

        // Variants / Dimensions
        let dimensions: string | null = null;
        let productNote: string | null = null;

        if (item.option_name) {
            dimensions = item.option_name;
        } else if (item.sku_options && Array.isArray(item.sku_options)) {
            dimensions = item.sku_options.map(opt => `${opt.name}: ${opt.value}`).join(" / ");
        }

        return {
            name: item.name || `Faire Ürün (${sku || "No SKU"})`,
            sku: sku,
            quantity: qty,
            image_src: resolvedImage,
            dimensions: dimensions,
            material: null,
            productNote: productNote
        };
    });

    const currency = order.currency || "USD";
    const totalVal = (totalCents / 100).toFixed(2);
    const totalFormatted = `${totalVal} ${currency}`;
    const orderDate = order.created_at ? new Date(order.created_at) : new Date();

    // Notes
    const noteParts: string[] = [];
    noteParts.push(`Faire Sipariş No: #${displayId}`);
    if (order.retailer?.name) noteParts.push(`Mağaza: ${order.retailer.name}`);
    if (order.state) noteParts.push(`Faire Durumu: ${order.state}`);
    if (order.carrier) noteParts.push(`Kargo Firması: ${order.carrier}`);
    const finalNote = noteParts.join(" | ");

    // Check if order exists (check by externalId: displayId or orderId)
    const existing = await db.order.findFirst({
        where: {
            source: "faire",
            OR: [
                { externalId: String(displayId) },
                { externalId: String(orderId) }
            ]
        },
        include: { items: true }
    });

    const labels = ["Faire"];
    if (order.state === "NEW") labels.push("Yeni");
    else if (order.state === "PROCESSING") labels.push("İşleniyor");
    else if (order.state === "PRE_TRANSIT" || order.state === "IN_TRANSIT") labels.push("Kargoda");
    else if (order.state === "DELIVERED") labels.push("Teslim Edildi");
    else if (order.state === "CANCELED") labels.push("İptal");

    if (existing) {
        const updateData: any = {};
        if (order.tracking_code && !existing.trackingNumber) {
            updateData.trackingNumber = order.tracking_code;
            updateData.cargoTrackingNumber = order.tracking_code;
        }

        // If cancelled in Faire, update note
        if (order.state === "CANCELED" && existing.status !== "cancelled") {
            updateData.note = (existing.note ? existing.note + " | " : "") + "[Faire'de İptal Edildi]";
        }

        if (Object.keys(updateData).length > 0) {
            await db.order.update({
                where: { id: existing.id },
                data: updateData
            });
        }

        return { success: true, isNew: false };
    }

    // Default status: Always goes to Bekliyor(printmarkt) (pending_pm) as requested!
    let orderStatus = options.defaultStatus || "pending_pm";
    if (order.state === "CANCELED") {
        orderStatus = "cancelled";
    }

    // Create New Order
    const newOrder = await db.order.create({
        data: {
            customer: customerName,
            phone: customerPhone,
            email: customerEmail,
            address: fullAddress,
            city: city,
            total: totalFormatted,
            status: orderStatus,
            date: orderDate,
            note: finalNote,
            labels: JSON.stringify(labels),
            barcode: `FAIRE-${displayId}`,
            paymentMethod: "Faire Wholesale",
            trackingNumber: order.tracking_code || null,
            cargoTrackingNumber: order.tracking_code || null,
            hasNotification: true,
            source: "faire",
            externalId: String(displayId),
            items: {
                create: items
            }
        }
    });

    // Add activity log
    try {
        await db.orderActivity.create({
            data: {
                orderId: newOrder.id,
                author: "Faire Entegrasyonu",
                action: "ORDER_SYNC",
                details: `Faire siparişi (#${displayId}) sisteme eklendi ve Bekliyor (PrintMarkt) durumuna alındı.`
            }
        });
    } catch (e) {
        // Activity log optional
    }

    return { success: true, isNew: true };
}
