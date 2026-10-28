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
/**
 * Parse line items from Shopify order payload
 */
export async function parseShopifyLineItems(lineItems: any[]): Promise<any[]> {
    if (!Array.isArray(lineItems)) return [];

    return Promise.all(
        lineItems.map(async (item: any) => {
            const properties: Array<{ name: string; value: any }> = Array.isArray(item.properties)
                ? item.properties
                : [];

            const getProp = (keys: string[], excludeKeys: string[] = []) => {
                const normKeys = keys.map(normalizeKey);
                const normExcludes = excludeKeys.map(normalizeKey);

                // 1. Try exact match first
                let found = properties.find((p: any) => {
                    const pName = normalizeKey(p.name || '');
                    if (normExcludes.some(ex => pName === ex || pName.includes(ex))) return false;
                    return normKeys.includes(pName);
                });

                // 2. Try substring match if no exact match
                if (!found) {
                    found = properties.find((p: any) => {
                        const pName = normalizeKey(p.name || '');
                        if (normExcludes.some(ex => pName === ex || pName.includes(ex))) return false;
                        return normKeys.some(k => pName.includes(k));
                    });
                }

                if (!found) return null;
                let val = found.value;
                if (val && typeof val === 'string') {
                    const srcMatch = val.match(/src=["']([^"']+)["']/i);
                    const hrefMatch = val.match(/href=["']([^"']+)["']/i);
                    if (srcMatch && srcMatch[1]) {
                        val = srcMatch[1].trim();
                    } else if (hrefMatch && hrefMatch[1]) {
                        val = hrefMatch[1].trim();
                    } else {
                        val = val.replace(/<[^>]*>?/gm, '').trim();
                    }
                }
                return val ? String(val) : null;
            };

            // Sample Detection
            const sampleProp = getProp(['numune', 'sample', '_sample']);
            const isSampleOrder = Boolean(
                sampleProp ||
                (item.title && /sample|numune/i.test(item.title)) ||
                (item.sku && /sample|numune/i.test(item.sku))
            );

            // Wallpaper Design Title (for sample orders where item title is "Wallpaper Sample")
            const wallpaperName = getProp(
                ['wallpaper', 'duvar kagidi', 'design', 'desen', 'motif'],
                ['url', 'image', 'resim', 'gorsel', 'material', 'malzeme', 'doku']
            );

            let finalName = item.title || item.name || 'Ürün';
            if (isSampleOrder && wallpaperName && !finalName.toLowerCase().includes(wallpaperName.toLowerCase())) {
                finalName = `${finalName} - ${wallpaperName}`;
            }

            // 1. Dimensions (Boyut / Ölçü)
            let dimensions = getProp(['boyut', 'olculer', 'dimensions', 'ebat', 'size', 'siparis olcusu', 'olcu'], ['wallpaper']);
            if (!dimensions) {
                const width = getProp(['genislik', 'width', 'en'], ['wallpaper']);
                const height = getProp(['yukseklik', 'height', 'boy'], ['wallpaper']);
                const unit = getProp(['birim', 'unit'], ['wallpaper']);
                if (width && height) {
                    const hasUnitAlready = /\b(cm|m|inch|in|mm)\b/i.test(`${width} ${height}`);
                    if (hasUnitAlready) {
                        dimensions = `${width} x ${height}`;
                    } else {
                        dimensions = `${width} x ${height} ${unit || 'cm'}`;
                    }
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
            // Exclude 'wallpaper' so property "Wallpaper: Pink Textured..." is not matched as material!
            let material = getProp(
                ['malzeme', 'doku', 'kagit turu', 'kagit cinsi', 'material', 'paper type', 'texture', 'pa_doku'],
                ['wallpaper', 'duvar kagidi', 'url', 'image']
            );
            if (!material && item.variant_title && !dimensions) {
                material = item.variant_title;
            }

            // 3. Image URL Resolution
            const isActualImageUrl = (url: string | null): boolean => {
                if (!url) return false;
                const clean = url.split('?')[0].toLowerCase();
                // If it is an HTML product page link (like /products/...), it is not an image
                if (clean.includes('/products/') && !clean.match(/\.(jpg|jpeg|png|webp|gif|svg)$/)) {
                    return false;
                }
                return (
                    clean.endsWith('.jpg') ||
                    clean.endsWith('.jpeg') ||
                    clean.endsWith('.png') ||
                    clean.endsWith('.webp') ||
                    clean.endsWith('.gif') ||
                    clean.endsWith('.svg') ||
                    clean.includes('cdn.shopify.com') ||
                    clean.includes('/cdn/shop/') ||
                    clean.includes('wm-crop')
                );
            };

            const extractCleanUrl = (val: any): string | null => {
                if (!val) return null;
                const str = String(val).trim();
                const imgMatch = str.match(/src=["']([^"']+)["']/i);
                if (imgMatch && imgMatch[1]) {
                    let src = imgMatch[1].trim();
                    if (src.startsWith('//')) src = `https:${src}`;
                    return src;
                }
                const hrefMatch = str.match(/href=["']([^"']+)["']/i);
                if (hrefMatch && hrefMatch[1]) {
                    let href = hrefMatch[1].trim();
                    if (href.startsWith('//')) href = `https:${href}`;
                    return href;
                }
                if (str.startsWith('//')) return `https:${str}`;
                if (str.startsWith('http://') || str.startsWith('https://')) return str;
                // Check if string contains an embedded http(s) URL
                const urlMatch = str.match(/(https?:\/\/[^\s"'<>]+)/i);
                if (urlMatch && urlMatch[1]) {
                    return urlMatch[1].trim();
                }
                return null;
            };

            // --- 6. Cropped Image Resolution (Customer-Selected Crop) ---
            let croppedImage: string | null = null;

            // Priority A: Search all properties for 'wm-crop' in value or name
            for (const p of properties) {
                const valStr = String(p.value || '').trim();
                if (valStr.includes('wm-crop')) {
                    const extracted = extractCleanUrl(valStr);
                    if (extracted && isActualImageUrl(extracted)) {
                        croppedImage = extracted;
                        break;
                    }
                }
            }

            // Priority B: Properties explicitly named for cropped/final image
            if (!croppedImage) {
                const cropProp = properties.find((p: any) => {
                    const pName = normalizeKey(p.name || '');
                    // Exclude coordinate or position properties like "_crop (x,y,w,h)", "_crop position"
                    if (pName.includes('(x,y') || pName.includes('position') || pName.includes('coordinate')) {
                        return false;
                    }
                    const isCropName = [
                        'final image',
                        'cropped image',
                        'crop image',
                        'kirpilan resim',
                        'kirpilmis resim',
                        'kirpma',
                        'cropped_image',
                        'wm-crop',
                        '_crop',
                        'crop',
                    ].some(term => pName.includes(term));

                    if (!isCropName) return false;

                    const extracted = extractCleanUrl(p.value);
                    return extracted && isActualImageUrl(extracted);
                });

                if (cropProp) {
                    croppedImage = extractCleanUrl(cropProp.value);
                }
            }

            // Priority C: Check any property value containing an image URL with 'crop' in it
            if (!croppedImage) {
                for (const p of properties) {
                    const valStr = String(p.value || '').trim();
                    if (valStr.includes('crop') && (valStr.includes('cdn.shopify.com') || valStr.includes('/files/'))) {
                        const extracted = extractCleanUrl(valStr);
                        if (extracted && isActualImageUrl(extracted)) {
                            croppedImage = extracted;
                            break;
                        }
                    }
                }
            }

            // --- Main Image Resolution ---
            let imageSrc: string | null = null;

            // A. Check properties for an explicit design image (e.g. "_Design Image", "Wallpaper Image", "Görsel")
            const imageProp = properties.find((p: any) => {
                const pName = normalizeKey(p.name || '');
                if (pName.includes('url') && !pName.includes('image') && !pName.includes('gorsel') && !pName.includes('resim')) {
                    return false;
                }
                return ['wallpaper image', 'design image', 'product image', 'gorsel', 'resim', 'image', 'picture', 'preview'].some(term => pName.includes(term));
            });

            if (imageProp) {
                const extracted = extractCleanUrl(imageProp.value);
                if (extracted && isActualImageUrl(extracted)) {
                    imageSrc = extracted;
                }
            }

            // B. If sample order (or no image found yet), pull actual design image from "Wallpaper URL"
            const wallpaperUrlProp = properties.find((p: any) => {
                const pName = normalizeKey(p.name || '');
                const pVal = String(p.value || '').trim();
                return (
                    pName.includes('wallpaper url') ||
                    pName.includes('product url') ||
                    (pVal.includes('/products/') && (pVal.includes('wallpapermarkt.com') || pVal.startsWith('http')))
                );
            });

            if ((!imageSrc || isSampleOrder) && wallpaperUrlProp) {
                let prodUrl = String(wallpaperUrlProp.value || '').trim();
                if (prodUrl) {
                    if (!prodUrl.startsWith('http')) {
                        prodUrl = `https://${prodUrl}`;
                    }
                    try {
                        const cleanUrl = prodUrl.split('?')[0].replace(/\/+$/, '');
                        const jsonUrl = `${cleanUrl}.js`;
                        const res = await fetch(jsonUrl, {
                            headers: { Accept: 'application/json' },
                            signal: AbortSignal.timeout(4000),
                        });
                        if (res.ok) {
                            const prodData = await res.json();
                            let featImg = prodData.featured_image || (Array.isArray(prodData.images) && prodData.images[0]);
                            if (featImg) {
                                if (typeof featImg === 'object' && featImg.src) featImg = featImg.src;
                                if (typeof featImg === 'string') {
                                    if (featImg.startsWith('//')) featImg = `https:${featImg}`;
                                    imageSrc = featImg;
                                }
                            }
                        }
                    } catch (fetchErr) {
                        console.warn('[SHOPIFY] Could not fetch product JSON for sample image:', fetchErr);
                    }
                }
            }

            // C. Fallback to Shopify line item's default image (if not set or for non-sample products)
            if (!imageSrc) {
                const defaultImg = item.image?.src || (Array.isArray(item.images) && item.images[0]?.src);
                if (defaultImg) {
                    const extracted = extractCleanUrl(defaultImg);
                    if (extracted && isActualImageUrl(extracted)) {
                        imageSrc = extracted;
                    }
                }
            }

            // D. Fallback placeholder
            if (!imageSrc) {
                imageSrc = 'https://placehold.co/600x400?text=Shopify+Urun';
            }

            // E. If customer has a cropped image, make sure it is prioritized as the primary visual on cards!
            if (croppedImage) {
                // Secondary visual can be the flat design or product image
                if (imageSrc && imageSrc !== croppedImage) {
                    imageSrc = `${croppedImage}|${imageSrc}`;
                } else {
                    imageSrc = croppedImage;
                }
            }

            // 4. Custom File / Cloud Link / Product Link
            let customFileUrl = getProp(['ozel url', 'dosya linki', 'file link', 'drive link', 'link', 'siparis dosyasi', 'cloud link', 'wallpaper url', 'product url']);
            if (!customFileUrl) {
                const linkProp = properties.find((p: any) => {
                    const pName = normalizeKey(p.name || '');
                    if (pName.includes('crop') || pName.includes('image') || pName.includes('resim')) return false;
                    const val = String(p.value || '').trim();
                    return (val.startsWith('http://') || val.startsWith('https://')) && !val.includes('wm-crop');
                });
                if (linkProp) {
                    customFileUrl = extractCleanUrl(linkProp.value);
                }
            }

            // 5. Product Note / Personalization
            const productNote = getProp(['urun notu', 'not', 'note', 'ozellestirme', 'personalization', 'custom text', 'yazi']);

            // 7. Sample Info
            const sampleData = sampleProp || (isSampleOrder ? '1' : null);

            return {
                name: finalName,
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
        })
    );
}

export interface ShopifyStoreConfig {
    storeId?: '1' | '2' | string;
    storeName?: string;
    source?: string;
    barcodePrefix?: string;
    shopDomain?: string;
}

/**
 * Process and upsert a Shopify order into the database
 */
export async function upsertShopifyOrder(shopifyOrder: any, storeConfig?: ShopifyStoreConfig) {
    if (!shopifyOrder || !shopifyOrder.id) {
        throw new Error('Geçersiz Shopify sipariş verisi.');
    }

    const source = storeConfig?.source || 'shopify';
    const barcodePrefix = storeConfig?.barcodePrefix || (source === 'shopify_2' ? 'SHOP2-' : 'SHOP-');
    const storeDisplayName = storeConfig?.storeName || (source === 'shopify_2' ? 'Shopify 2' : 'Shopify');

    const orderId = String(shopifyOrder.id);
    const orderNumber = String(shopifyOrder.order_number || shopifyOrder.name?.replace('#', '') || orderId);
    const externalId = orderNumber;
    const barcode = `${barcodePrefix}${orderNumber}`;

    // Target PrintMarkt pending column ("Bekliyor (PrintMarkt)" / "pending_pm")
    const statuses = await db.statusColumn.findMany({ orderBy: { order: 'asc' } });
    let defaultStatus = 'pending_pm';

    const pmColumn = statuses.find(s =>
        s.id === 'pending_pm' ||
        s.title.toLowerCase().includes('printmarkt')
    );
    if (pmColumn) {
        defaultStatus = pmColumn.id;
    } else if (statuses.length > 0) {
        defaultStatus = statuses[0].id;
    }

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
    const parsedItems = await parseShopifyLineItems(shopifyOrder.line_items || []);

    // Labels
    let labels: string[] = ['Shopify'];
    if (source === 'shopify_2') {
        labels.push(storeDisplayName);
    }
    labels.push('Yeni');
    const financialStatus = shopifyOrder.financial_status;
    const isFailedPayment = financialStatus === 'voided' || financialStatus === 'refunded';
    if (isFailedPayment) {
        labels.push('Ödeme Başarısız');
    } else if (financialStatus === 'pending') {
        labels.push('Ödeme Bekleniyor');
    }

    // Check if order already exists (idempotency by source+externalId or barcode)
    const existingOrder = await db.order.findFirst({
        where: {
            OR: [
                { source: source, externalId: externalId },
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

        const localLabelsStr = typeof existingOrder.labels === 'string' ? existingOrder.labels : JSON.stringify(existingOrder.labels || []);
        const finalLabelsStr = JSON.stringify(finalLabels);
        const hasLabelChange = localLabelsStr !== finalLabelsStr;
        const hasTotalChange = existingOrder.total !== totalFormatted;
        const hasMeaningfulChange = hasLabelChange || hasTotalChange;

        const updateData: any = {
            customer: existingOrder.customer || customer,
            phone: existingOrder.phone || phone,
            email: existingOrder.email || email,
            address: existingOrder.address || address,
            city: existingOrder.city || city,
            total: totalFormatted,
            paymentMethod,
            taxNumber: taxNumber || existingOrder.taxNumber,
            taxOffice: taxOffice || existingOrder.taxOffice,
            labels: JSON.stringify(finalLabels),
            updatedAt: hasMeaningfulChange ? new Date() : existingOrder.updatedAt,
        };

        if (note && !existingOrder.note) {
            updateData.note = note;
        }

        await db.order.update({
            where: { id: existingOrder.id },
            data: updateData,
        });

        if (hasMeaningfulChange) {
            await db.orderActivity.create({
                data: {
                    orderId: existingOrder.id,
                    author: `${storeDisplayName} Webhook`,
                    action: 'ORDER_SYNC',
                    details: `${storeDisplayName} siparişi (#${externalId}) güncellendi. Finansal Durum: ${financialStatus || 'bilinmiyor'}`,
                },
            });
        }

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
            source: source,
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
            author: storeDisplayName,
            action: 'ORDER_CREATE',
            details: `${storeDisplayName} üzerinden #${externalId} numaralı yeni sipariş sisteme eklendi.`,
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
