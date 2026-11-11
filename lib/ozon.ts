import { db } from './prisma';

export interface OzonPostingProduct {
    price: string;
    offer_id: string;
    name: string;
    sku: number | string;
    quantity: number;
    currency_code?: string;
    mandatory_mark?: any[];
}

export interface OzonPosting {
    posting_number: string;
    order_id: number | string;
    order_number: string;
    status: string;
    substatus?: string;
    in_process_at?: string;
    shipment_date?: string;
    delivery_method?: {
        id: number;
        name: string;
        warehouse: string;
        warehouse_id?: number;
    };
    tracking_number?: string;
    tpl_provider?: {
        id: number;
        name: string;
    };
    customer?: {
        customer_id?: number;
        name?: string;
        phone?: string;
        email?: string;
        address?: {
            address_tail?: string;
            city?: string;
            country?: string;
            district?: string;
            region?: string;
            zip_code?: string;
            comment?: string;
        };
    };
    addressee?: {
        name?: string;
        phone?: string;
    };
    analytics_data?: {
        city?: string;
        delivery_type?: string;
        payment_type_group_name?: string;
        warehouse_name?: string;
    };
    products: OzonPostingProduct[];
    financial_data?: {
        products?: Array<{
            price: number | string;
            currency_code?: string;
            product_id?: number;
        }>;
    };
}

/**
 * Test credentials against Ozon Seller API
 */
export async function testOzonConnection(clientId: string, apiKey: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const cId = clientId?.trim();
    const key = apiKey?.trim();

    if (!cId || !key) {
        return { success: false, error: "Client-Id veya Api-Key eksik." };
    }

    try {
        const res = await fetch("https://api-seller.ozon.ru/v3/posting/fbs/unfulfilled/list", {
            method: "POST",
            headers: {
                "Client-Id": cId,
                "Api-Key": key,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                dir: "DESC",
                filter: {
                    cutoff_from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                    cutoff_to: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                },
                limit: 1,
                offset: 0
            }),
            cache: 'no-store'
        });

        if (res.ok) {
            return { success: true, message: "Ozon Seller API bağlantısı başarılı!" };
        }

        const errText = await res.text().catch(() => "");
        if (res.status === 401 || res.status === 403) {
            return {
                success: false,
                error: `Ozon Yetkilendirme Hatası (${res.status}): Client ID veya API Anahtarınız hatalı ya da izinleri eksik. Lütfen kontrol ediniz.`
            };
        }

        return {
            success: false,
            error: `Ozon API Hatası (HTTP ${res.status}): ${errText.substring(0, 150)}`
        };
    } catch (e: any) {
        return { success: false, error: `Bağlantı hatası: ${e.message}` };
    }
}

/**
 * Fetch Product Images in batch using Ozon Product Info API
 */
export async function fetchOzonProductImages(
    clientId: string,
    apiKey: string,
    offerIds: string[]
): Promise<Map<string, string>> {
    const imageMap = new Map<string, string>();
    if (!offerIds || offerIds.length === 0) return imageMap;

    const uniqueOffers = Array.from(new Set(offerIds.filter(Boolean)));
    const chunks = [];
    for (let i = 0; i < uniqueOffers.length; i += 100) {
        chunks.push(uniqueOffers.slice(i, i + 100));
    }

    for (const chunk of chunks) {
        try {
            const res = await fetch("https://api-seller.ozon.ru/v3/product/info/list", {
                method: "POST",
                headers: {
                    "Client-Id": clientId.trim(),
                    "Api-Key": apiKey.trim(),
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    offer_id: chunk,
                    product_id: [],
                    sku: []
                }),
                cache: 'no-store'
            });

            if (res.ok) {
                const data: any = await res.json();
                const items = data.result?.items || data.items || [];
                for (const it of items) {
                    const img = it.primary_image || (Array.isArray(it.images) && it.images[0]) || "";
                    if (img && it.offer_id) {
                        imageMap.set(it.offer_id, img);
                    }
                }
            }
        } catch (err) {
            console.error("[OZON_IMAGE_FETCH_ERR]", err);
        }
    }

    return imageMap;
}

/**
 * Fetch Postings from Ozon (FBS unfulfilled + recent postings)
 */
export async function fetchOzonOrders(
    clientId: string,
    apiKey: string,
    daysBack: number = 30
): Promise<{ postings: OzonPosting[]; error?: string }> {
    const cId = clientId?.trim();
    const key = apiKey?.trim();

    if (!cId || !key) {
        return { postings: [], error: "Ozon Client ID veya API Key eksik." };
    }

    const allPostingsMap = new Map<string, OzonPosting>();

    const headers = {
        "Client-Id": cId,
        "Api-Key": key,
        "Content-Type": "application/json"
    };

    // 1. Unfulfilled postings (awaiting packaging & delivery)
    try {
        const unfulfilledRes = await fetch("https://api-seller.ozon.ru/v3/posting/fbs/unfulfilled/list", {
            method: "POST",
            headers,
            body: JSON.stringify({
                dir: "DESC",
                filter: {
                    cutoff_from: new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString(),
                    cutoff_to: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()
                },
                limit: 50,
                offset: 0,
                with: {
                    analytics_data: true,
                    barcodes: true,
                    financial_data: true
                }
            }),
            cache: 'no-store'
        });

        if (unfulfilledRes.ok) {
            const data: any = await unfulfilledRes.json();
            const list: OzonPosting[] = data.result?.postings || data.result || [];
            for (const p of list) {
                if (p.posting_number) allPostingsMap.set(p.posting_number, p);
            }
        }
    } catch (e: any) {
        console.warn("[OZON_UNFULFILLED_FETCH_WARN]", e.message);
    }

    // 2. Recent postings (since X days ago)
    try {
        const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
        const toDate = new Date().toISOString();

        const listRes = await fetch("https://api-seller.ozon.ru/v3/posting/fbs/list", {
            method: "POST",
            headers,
            body: JSON.stringify({
                dir: "DESC",
                filter: {
                    since: sinceDate,
                    to: toDate
                },
                limit: 50,
                offset: 0,
                with: {
                    analytics_data: true,
                    barcodes: true,
                    financial_data: true
                }
            }),
            cache: 'no-store'
        });

        if (listRes.ok) {
            const data: any = await listRes.json();
            const list: OzonPosting[] = data.result?.postings || data.result || [];
            for (const p of list) {
                if (p.posting_number) allPostingsMap.set(p.posting_number, p);
            }
        } else if (allPostingsMap.size === 0) {
            const errText = await listRes.text().catch(() => "");
            return {
                postings: [],
                error: `Ozon API hatası (${listRes.status}): ${errText.substring(0, 120)}`
            };
        }
    } catch (e: any) {
        console.warn("[OZON_LIST_FETCH_WARN]", e.message);
    }

    return { postings: Array.from(allPostingsMap.values()) };
}

/**
 * Upsert an Ozon Posting into the database
 */
export async function upsertOzonPosting(
    posting: OzonPosting,
    options: {
        defaultStatus: string;
        imageMap?: Map<string, string>;
    }
): Promise<{ success: boolean; isNew: boolean; error?: string }> {
    const postingNumber = posting.posting_number;
    if (!postingNumber) {
        return { success: false, isNew: false, error: "Posting number bulunamadı." };
    }

    // Customer & Contact Info
    const customerName =
        posting.addressee?.name ||
        posting.customer?.name ||
        `Ozon Müşterisi #${posting.order_number || postingNumber.split('-')[0]}`;

    const customerPhone =
        posting.addressee?.phone ||
        posting.customer?.phone ||
        null;

    const customerEmail = posting.customer?.email || null;

    // Address construction
    const addressParts: string[] = [];
    if (posting.customer?.address) {
        const addr = posting.customer.address;
        if (addr.address_tail) addressParts.push(addr.address_tail);
        if (addr.district) addressParts.push(addr.district);
        if (addr.comment) addressParts.push(`Not: ${addr.comment}`);
    }
    if (posting.delivery_method?.name) {
        addressParts.push(`Teslimat: ${posting.delivery_method.name}`);
    }
    if (posting.delivery_method?.warehouse) {
        addressParts.push(`Depo: ${posting.delivery_method.warehouse}`);
    }
    const fullAddress = addressParts.join(" / ") || "Ozon Teslimat Noktası";

    const city =
        posting.customer?.address?.city ||
        posting.analytics_data?.city ||
        "Rusya / Ozon";

    // Products & Pricing
    let totalVal = 0;
    let currency = "RUB";

    const items = (posting.products || []).map((prod) => {
        const unitPrice = parseFloat(prod.price || "0");
        const qty = prod.quantity || 1;
        totalVal += unitPrice * qty;
        if (prod.currency_code) currency = prod.currency_code;

        const sku = prod.offer_id || (prod.sku ? String(prod.sku) : null);
        const resolvedImage =
            (sku && options.imageMap?.get(sku)) ||
            "https://placehold.co/600x400?text=Ozon+Urun";

        return {
            name: prod.name || `Ozon Ürün (${sku || "No SKU"})`,
            sku: sku,
            quantity: qty,
            image_src: resolvedImage,
            dimensions: null,
            material: null
        };
    });

    const totalFormatted = `${totalVal.toFixed(2)} ${currency}`;
    const orderDate = posting.in_process_at ? new Date(posting.in_process_at) : new Date();

    // Notes
    const noteParts: string[] = [];
    noteParts.push(`Ozon Gönderi No: ${postingNumber}`);
    if (posting.order_number) noteParts.push(`Sipariş No: ${posting.order_number}`);
    if (posting.shipment_date) {
        const shipDate = new Date(posting.shipment_date).toLocaleString("tr-TR");
        noteParts.push(`Son Kargolama: ${shipDate}`);
    }
    if (posting.delivery_method?.name) {
        noteParts.push(`Kargo: ${posting.delivery_method.name}`);
    }
    const finalNote = noteParts.join(" | ");

    // Check if order exists
    const existing = await db.order.findUnique({
        where: {
            source_externalId: {
                source: "ozon",
                externalId: postingNumber
            }
        },
        include: { items: true }
    });

    const labels = ["Ozon"];
    if (posting.status === "awaiting_packaging") labels.push("Paketleme Bekliyor");
    else if (posting.status === "awaiting_deliver") labels.push("Kargo Bekliyor");
    else if (posting.status === "delivering") labels.push("Kargoda");
    else if (posting.status === "cancelled") labels.push("İptal");
    else labels.push("Yeni");

    if (existing) {
        // Update existing if tracking number or status changed
        const updateData: any = {};
        if (posting.tracking_number && !existing.trackingNumber) {
            updateData.trackingNumber = posting.tracking_number;
            updateData.cargoTrackingNumber = posting.tracking_number;
        }

        // Move to pending_pm if it was created in a generic pending status
        if (existing.status !== "pending_pm" && (existing.status === "pending" || existing.status === "draft" || existing.status === "pending_woo")) {
            updateData.status = "pending_pm";
        }

        // If cancelled in Ozon, mark cancelled if order is still pending
        if (posting.status === "cancelled" && existing.status !== "cancelled") {
            updateData.note = (existing.note ? existing.note + " | " : "") + "[Ozon'da İptal Edildi]";
        }

        if (Object.keys(updateData).length > 0) {
            await db.order.update({
                where: { id: existing.id },
                data: updateData
            });
        }

        return { success: true, isNew: false };
    }

    // Determine status (Bekliyor (PrintMarkt) - pending_pm)
    let orderStatus = options.defaultStatus || "pending_pm";
    if (posting.status === "cancelled") {
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
            barcode: `OZON-${postingNumber}`,
            paymentMethod: "Ozon Marketplace",
            trackingNumber: posting.tracking_number || null,
            cargoTrackingNumber: posting.tracking_number || null,
            hasNotification: true,
            source: "ozon",
            externalId: postingNumber,
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
                author: "Ozon Entegrasyonu",
                action: "ORDER_SYNC",
                details: `Ozon siparişi (#${postingNumber}) sisteme eklendi.`
            }
        });
    } catch (e) {
        // Activity log optional
    }

    return { success: true, isNew: true };
}
