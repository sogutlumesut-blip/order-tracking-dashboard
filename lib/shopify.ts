import crypto from 'crypto';
import { db } from './prisma';
import { generateDHLShipment } from './cargo-service';

/**
 * Clean Shopify domain string (removes protocol, trailing slashes, whitespace)
 */
export function cleanShopifyDomain(domain?: string | null): string {
    if (!domain) return '';
    let cleaned = domain.trim();
    cleaned = cleaned.replace(/^https?:\/\//i, '');
    cleaned = cleaned.replace(/\/+$/, '');
    return cleaned;
}

/**
 * Verify Shopify Webhook HMAC-SHA256 signature
 */
export function verifyShopifyWebhook(rawBody: string, hmacHeader: string | null, secret?: string | null): boolean {
    if (!secret || secret.trim().length === 0) {
        // If user hasn't set a webhook secret yet, allow the webhook
        return true;
    }
    if (!hmacHeader) {
        return false;
    }

    try {
        const generatedHash = crypto
            .createHmac('sha256', secret.trim())
            .update(rawBody, 'utf8')
            .digest('base64');

        const hashBuffer = Buffer.from(generatedHash);
        const headerBuffer = Buffer.from(hmacHeader);

        if (hashBuffer.length !== headerBuffer.length) {
            return false;
        }

        return crypto.timingSafeEqual(hashBuffer, headerBuffer);
    } catch (err) {
        console.error('[SHOPIFY_WEBHOOK] Error verifying HMAC:', err);
        return false;
    }
}

/**
 * Fetch orders directly from Shopify Admin REST API
 */
export async function fetchShopifyOrders(shopDomain: string, accessToken: string, limit: number = 50) {
    const domain = cleanShopifyDomain(shopDomain);
    if (!domain || !accessToken) {
        throw new Error('Shopify mağaza adresi veya Access Token eksik.');
    }

    const url = `https://${domain}/admin/api/2024-01/orders.json?status=any&limit=${limit}`;
    const response = await fetch(url, {
        headers: {
            'X-Shopify-Access-Token': accessToken.trim(),
            'Content-Type': 'application/json',
        },
        cache: 'no-store',
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Shopify API hatası (HTTP ${response.status}): ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    return data.orders || [];
}

/**
 * Helper to normalize string for comparison
 */
function normalizeKey(str: string): string {
    return (str || '')
        .toLowerCase()
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ı/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .trim();
}

/**
 * Parse line items from Shopify order payload
 */
export function parseShopifyLineItems(lineItems: any[]) {
    if (!Array.isArray(lineItems)) return [];

    return lineItems.map((item: any) => {
        const properties: Array<{ name: string; value: any }> = Array.isArray(item.properties)
            ? item.properties
            : [];

        const getProp = (keys: string[]) => {
            const normKeys = keys.map(normalizeKey);
            const found = properties.find((p: any) => {
                const pName = normalizeKey(p.name || '');
                return normKeys.includes(pName) || normKeys.some(k => pName.includes(k));
            });
            if (!found) return null;
            let val = found.value;
            if (val && typeof val === 'string') {
                val = val.replace(/<[^>]*>?/gm, '').trim();
            }
            return val ? String(val) : null;
        };

        // 1. Dimensions (Boyut / Ölçü)
        let dimensions = getProp(['boyut', 'olculer', 'dimensions', 'ebat', 'size', 'siparis olcusu', 'olcu']);
        if (!dimensions) {
            const width = getProp(['genislik', 'width', 'en']);
            const height = getProp(['yukseklik', 'height', 'boy']);
            const unit = getProp(['birim', 'unit']) || 'cm';
            if (width && height) {
                dimensions = `${width} x ${height} ${unit}`;
            }
        }
        // Fallback to variant_title if it contains dimensions
        if (!dimensions && item.variant_title) {
            const dimMatch = item.variant_title.match(/(\d+(?:[.,]\d+)?\s*(?:x|\*|X)\s*\d+(?:[.,]\d+)?(?:\s*(?:cm|m|inch|in|mm))?)/i);
            if (dimMatch) {
                dimensions = dimMatch[1].trim();
            }
        }

        // 2. Material (Malzeme / Doku)
        let material = getProp(['malzeme', 'doku', 'kagit turu', 'kagit cinsi', 'material', 'paper type', 'paper', 'texture', 'pa_doku']);
        if (!material && item.variant_title && !dimensions) {
            material = item.variant_title;
        }

        // 3. Image URL
        let imageSrc = item.image?.src || (Array.isArray(item.images) && item.images[0]?.src) || null;
        if (!imageSrc) {
            // Check properties for uploaded image or preview link
            const imgProp = properties.find((p: any) => {
                const pName = normalizeKey(p.name || '');
                const pVal = String(p.value || '').trim();
                const isImgKey = ['gorsel', 'resim', 'image', 'picture', 'foto', 'dosya', 'upload', 'file', 'preview'].some(term => pName.includes(term));
                return isImgKey || pVal.startsWith('http');
            });
            if (imgProp && String(imgProp.value).startsWith('http')) {
                imageSrc = String(imgProp.value).trim();
            }
        }
        if (!imageSrc) {
            imageSrc = 'https://placehold.co/600x400?text=Shopify+Urun';
        }

        // 4. Custom File / Cloud Link
        let customFileUrl = getProp(['ozel url', 'dosya linki', 'file link', 'drive link', 'link', 'url', 'siparis dosyasi', 'cloud link']);
        if (!customFileUrl) {
            const linkProp = properties.find((p: any) => {
                const val = String(p.value || '').trim();
                return val.startsWith('http://') || val.startsWith('https://');
            });
            if (linkProp) {
                customFileUrl = String(linkProp.value).trim();
            }
        }

        // 5. Product Note / Personalization
        const productNote = getProp(['urun notu', 'not', 'note', 'ozellestirme', 'personalization', 'custom text', 'yazi']);

        // 6. Cropped image
        const croppedImage = getProp(['kirpilan resim', 'cropped_image', 'cropped image', 'crop']);

        // 7. Sample Info
        const sampleData = getProp(['numune', 'sample']);

        return {
            name: item.title || item.name || 'Ürün',
            sku: item.sku || (item.product_id ? String(item.product_id) : null),
            quantity: Number(item.quantity) || 1,
            image_src: imageSrc,
            url: customFileUrl,
            material: material,
            dimensions: dimensions,
            productNote: productNote,
            sampleData: sampleData,
            croppedImage: croppedImage,
        };
    });
}

/**
 * Process and upsert a Shopify order into the database
 */
export async function upsertShopifyOrder(shopifyOrder: any) {
    if (!shopifyOrder || !shopifyOrder.id) {
        throw new Error('Geçersiz Shopify sipariş verisi.');
    }

    const orderId = String(shopifyOrder.id);
    const orderNumber = String(shopifyOrder.order_number || shopifyOrder.name?.replace('#', '') || orderId);
    const externalId = orderNumber;
    const barcode = `SHOP-${orderNumber}`;

    // Prefetch Statuses to map to default "Incoming" / "Gelen Siparişler"
    const statuses = await db.statusColumn.findMany({ orderBy: { order: 'asc' } });
    let defaultStatus = statuses.length > 0 ? statuses[0].id : 'pending';

    const incoming = statuses.find(s =>
        s.title.toLowerCase().includes('gelen') ||
        s.title.toLowerCase().includes('yeni') ||
        s.title.toLowerCase().includes('sipariş') ||
        s.id === 'pending'
    );
    if (incoming) defaultStatus = incoming.id;

    // Customer & Address Info
    const shipping = shopifyOrder.shipping_address;
    const billing = shopifyOrder.billing_address;
    const customerObj = shopifyOrder.customer;

    const shippingName = shipping?.name || `${shipping?.first_name || ''} ${shipping?.last_name || ''}`.trim();
    const billingName = billing?.name || `${billing?.first_name || ''} ${billing?.last_name || ''}`.trim();
    const customerObjName = `${customerObj?.first_name || ''} ${customerObj?.last_name || ''}`.trim();

    const customer = shippingName || billingName || customerObjName || 'Misafir Müşteri';
    const phone = shipping?.phone || billing?.phone || customerObj?.phone || '';
    const email = shopifyOrder.email || customerObj?.email || billing?.email || '';

    // Address
    const addressParts: string[] = [];
    if (shipping) {
        if (shipping.address1) addressParts.push(shipping.address1.trim());
        if (shipping.address2) addressParts.push(shipping.address2.trim());
    } else if (billing) {
        if (billing.address1) addressParts.push(billing.address1.trim());
        if (billing.address2) addressParts.push(billing.address2.trim());
    }
    const address = addressParts.join(', ');

    // City & Country / State
    const cityObj = shipping || billing;
    const cityParts: string[] = [];
    if (cityObj?.city) cityParts.push(cityObj.city.trim());
    if (cityObj?.province) cityParts.push(cityObj.province.trim());
    if (cityObj?.country) cityParts.push(cityObj.country.trim());
    const city = cityParts.join(' / ');

    // Total Amount & Currency
    const currency = shopifyOrder.currency || 'USD';
    const totalAmount = shopifyOrder.total_price || shopifyOrder.current_total_price || '0';
    let totalFormatted = `${totalAmount} ${currency}`;
    if (currency === 'USD') totalFormatted = `$${totalAmount}`;
    else if (currency === 'EUR') totalFormatted = `€${totalAmount}`;
    else if (currency === 'TRY') totalFormatted = `${totalAmount} ₺`;

    // Notes
    const note = shopifyOrder.note || null;

    // Payment method
    let paymentMethod = 'Shopify';
    if (Array.isArray(shopifyOrder.payment_gateway_names) && shopifyOrder.payment_gateway_names.length > 0) {
        paymentMethod = shopifyOrder.payment_gateway_names.join(', ');
    } else if (shopifyOrder.financial_status) {
        paymentMethod = `Shopify (${shopifyOrder.financial_status})`;
    }

    // Tax Info from note_attributes if present
    let taxNumber: string | null = null;
    let taxOffice: string | null = null;
    if (Array.isArray(shopifyOrder.note_attributes)) {
        const taxNumAttr = shopifyOrder.note_attributes.find((a: any) =>
            ['tc', 'tckn', 'vkn', 'vergi_no', 'tax_id', 'tax_number', 'tc_kimlik'].includes(normalizeKey(a.name || ''))
        );
        if (taxNumAttr?.value) taxNumber = String(taxNumAttr.value).trim();

        const taxOffAttr = shopifyOrder.note_attributes.find((a: any) =>
            ['vergi_dairesi', 'tax_office'].includes(normalizeKey(a.name || ''))
        );
        if (taxOffAttr?.value) taxOffice = String(taxOffAttr.value).trim();
    }

    // Line items
    const parsedItems = parseShopifyLineItems(shopifyOrder.line_items || []);

    // Labels
    let labels: string[] = ['Shopify', 'Yeni'];
    const financialStatus = shopifyOrder.financial_status;
    const isFailedPayment = financialStatus === 'voided' || financialStatus === 'refunded';
    if (isFailedPayment) {
        labels.push('Ödeme Başarısız');
    } else if (financialStatus === 'pending') {
        labels.push('Ödeme Bekleniyor');
    }

    // Check if order already exists (idempotency by externalId or barcode)
    const existingOrder = await db.order.findFirst({
        where: {
            OR: [
                { source: 'shopify', externalId: externalId },
                { barcode: barcode },
            ],
        },
    });

    if (existingOrder) {
        // Preserve local labels
        let existingLabels: string[] = [];
        try {
            const parsed = typeof existingOrder.labels === 'string' ? JSON.parse(existingOrder.labels) : existingOrder.labels;
            existingLabels = Array.isArray(parsed) ? parsed : [];
        } catch {
            existingLabels = [];
        }

        let finalLabels = Array.from(new Set([...existingLabels, ...labels]));
        // If payment is now paid, remove 'Ödeme Başarısız' and 'Ödeme Bekleniyor'
        if (financialStatus === 'paid') {
            finalLabels = finalLabels.filter(l => l !== 'Ödeme Başarısız' && l !== 'Ödeme Bekleniyor');
        }

        const updateData: any = {
            customer,
            phone: phone || existingOrder.phone,
            email: email || existingOrder.email,
            address: address || existingOrder.address,
            city: city || existingOrder.city,
            total: totalFormatted,
            paymentMethod,
            taxNumber: taxNumber || existingOrder.taxNumber,
            taxOffice: taxOffice || existingOrder.taxOffice,
            labels: JSON.stringify(finalLabels),
            updatedAt: new Date(),
        };

        if (note && !existingOrder.note) {
            updateData.note = note;
        }

        // If items exist, refresh them
        if (parsedItems.length > 0) {
            updateData.items = {
                deleteMany: {},
                create: parsedItems,
            };
        }

        await db.order.update({
            where: { id: existingOrder.id },
            data: updateData,
        });

        await db.orderActivity.create({
            data: {
                orderId: existingOrder.id,
                author: 'Shopify Webhook',
                action: 'ORDER_SYNC',
                details: `Shopify siparişi (#${externalId}) güncellendi. Finansal Durum: ${financialStatus || 'bilinmiyor'}`,
            },
        });

        return { success: true, isNew: false, order: existingOrder };
    }

    // Create New Order
    const newOrder = await db.order.create({
        data: {
            customer,
            phone,
            email,
            address,
            city,
            total: totalFormatted,
            status: defaultStatus,
            date: new Date(shopifyOrder.created_at || Date.now()),
            updatedAt: new Date(shopifyOrder.updated_at || Date.now()),
            note,
            labels: JSON.stringify(labels),
            barcode: barcode,
            paymentMethod,
            hasNotification: true, // Trigger audio/badge notification
            source: 'shopify',
            externalId: externalId,
            taxNumber,
            taxOffice,
            items: {
                create: parsedItems,
            },
        },
    });

    // Add activity log
    await db.orderActivity.create({
        data: {
            orderId: newOrder.id,
            author: 'Shopify Entegrasyonu',
            action: 'ORDER_CREATE',
            details: `Shopify üzerinden #${externalId} numaralı yeni sipariş sisteme eklendi.`,
        },
    });

    // Auto DHL generation if configured
    try {
        await generateDHLShipment(newOrder.id, 'Sistem', true);
    } catch (dhlErr) {
        console.error('[SHOPIFY_AUTO_DHL_ERR]', dhlErr);
    }

    return { success: true, isNew: true, order: newOrder };
}
