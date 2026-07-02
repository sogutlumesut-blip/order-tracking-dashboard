import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function run() {
    console.log("Loading settings...");
    const settingsRaw = await db.systemSetting.findMany();
    const settings: Record<string, string> = {};
    settingsRaw.forEach(s => {
        settings[s.key] = s.value;
    });

    if (!settings['pm_url'] || !settings['pm_key']) {
        console.error("PrintMarkt settings missing in DB!");
        return;
    }

    let cleanUrl = settings['pm_url'].replace(/\/+$/, '');
    let fetchUrl = `${cleanUrl}/api/orders?_t=${Date.now()}`;
    console.log("Fetching orders from:", fetchUrl);

    let response = await fetch(fetchUrl, {
        headers: { "X-API-Key": settings['pm_key'] },
        cache: 'no-store'
    });

    if (response.status === 401 || response.status === 403) {
        response = await fetch(fetchUrl, {
            headers: { "Authorization": `Bearer ${settings['pm_key']}` },
            cache: 'no-store'
        });
    }

    if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.error(`HTTP Error ${response.status}: ${errText.substring(0, 200)}`);
        return;
    }

    const pmOrders = await response.json();
    console.log(`Fetched ${pmOrders.length} orders.`);

    if (!Array.isArray(pmOrders)) {
        console.error("API response is not an array!");
        return;
    }

    let importedCount = 0;
    let errorCount = 0;

    for (const pmOrder of pmOrders.slice(0, 10)) { // Just test first 10 for safety
        try {
            const externalId = pmOrder.id?.toString() || pmOrder.external_id || pmOrder.order_number?.toString() || pmOrder.number?.toString();
            if (!externalId) {
                console.log("Skipping order with no ID");
                continue;
            }

            console.log(`Checking order ID: ${externalId}`);
            const existingOrder = await db.order.findFirst({
                where: { externalId: `pm_${externalId}` }
            });

            if (existingOrder) {
                console.log(`Order ${externalId} already exists in DB.`);
            }

            if (pmOrder?.source?.toString().toLowerCase() === 'etsy') {
                console.log(`Skipping Etsy order ${externalId}`);
                continue;
            }

            let shippingName = pmOrder.dealer_name || pmOrder.user_full_name || pmOrder.recipient_name || "Bilinmiyor";
            let shippingEmail = pmOrder.recipient_email || pmOrder.email || pmOrder.account_email || "";
            let shippingPhone = pmOrder.recipient_phone || pmOrder.phone || "";

            let street = pmOrder.street || pmOrder.address1 || "";
            let city = pmOrder.city || "";
            let state = pmOrder.state || pmOrder.province || "";
            let zip = pmOrder.zip_code || pmOrder.zip || "";
            let country = pmOrder.country || "";

            let shippingAddress = `${street} ${city} ${state} ${zip} ${country}`.trim();
            if (!shippingAddress) shippingAddress = "Adres bulunamadı";

            const items = [];
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

                let materialStr = item.material || item.selectedTexture || "";
                const material = materialStr ? decodeHtml(String(materialStr)) : "";

                let dimsStr = item.dimensions || item.size || "";
                if (!dimsStr && item.width && item.height) {
                    dimsStr = `${item.width}x${item.height} ${item.unit || 'cm'}`;
                }

                const dimensions = dimsStr ? decodeHtml(String(dimsStr)) : "";

                let customFileUrlStr = "";
                const csl = pmOrder.custom_shipping_label_url || pmOrder.shipping_label_url;
                if (csl && csl.startsWith("data:")) {
                    customFileUrlStr = csl;
                } else if (csl) {
                    customFileUrlStr = csl.startsWith("http") ? csl : `${cleanUrl}${csl.startsWith('/') ? '' : '/'}${csl}`;
                }

                let originalDesignUrlStr = "";
                const pfUrl = pmOrder.production_file_url || pmOrder.file_url;
                if (pfUrl && pfUrl.startsWith("data:")) {
                     originalDesignUrlStr = pfUrl;
                } else if (pfUrl) {
                    originalDesignUrlStr = pfUrl.startsWith("http") ? pfUrl : `${cleanUrl}${pfUrl.startsWith('/') ? '' : '/'}${pfUrl}`;
                }
                
                let finalUrl = customFileUrlStr || originalDesignUrlStr || item.external_url || item.product_link || item.url || pmOrder.external_product_link || "";
                let finalImageSrc = item.image_url || item.image || item.thumbnail || item.selectedImage || finalUrl || "";

                if (finalImageSrc && !finalImageSrc.startsWith("http") && !finalImageSrc.startsWith("data:")) {
                    finalImageSrc = `${cleanUrl}${finalImageSrc.startsWith('/') ? '' : '/'}${finalImageSrc}`;
                }

                items.push({
                    name: decodeHtml(item.name || item.title || "Özel Sipariş Ürün (Manuel)"),
                    quantity: qty,
                    sku: item.sku || item.stockCode || "",
                    image_src: finalImageSrc,
                    material: material,
                    dimensions: dimensions,
                    url: finalUrl
                });
            }

            if (totalAmount === 0 && pmOrder.total_price) {
                totalAmount = parseFloat(pmOrder.total_price);
            }

            const status = (pmOrder.status || pmOrder.order_status || "pending").toLowerCase();
            const mappedStatus = (status.includes("ship") || status === "completed") ? "shipped" : "pending";

            let paymentMethod = pmOrder.payment_method || pmOrder.gateway || "API";
            if (paymentMethod.toUpperCase() === 'ON_ACCOUNT') paymentMethod = 'PrintMarkt';

            const customerNote = pmOrder.note || pmOrder.customer_note || pmOrder.order_note || "";
            const trackingPdf = pmOrder.custom_shipping_label_url || pmOrder.production_file_url || null;

            console.log(`WOULD INSERT order ${externalId} with ${items.length} items. Image URL prefix check: ${items[0]?.image_src}`);

            // To actually test database insertion, we create and delete immediately.
            const created = await db.order.create({
                data: {
                    externalId: `pm_test_${externalId}`,
                    source: "PrintMarkt",
                    customer: shippingName,
                    email: shippingEmail,
                    phone: shippingPhone,
                    address: shippingAddress,
                    total: totalAmount.toFixed(2),
                    paymentMethod: paymentMethod,
                    status: mappedStatus,
                    note: customerNote,
                    cargoLabelPdf: trackingPdf,
                    labels: "[]",
                    items: {
                        create: items
                    }
                }
            });

            console.log(`Successfully created test order ${created.id}. Cleaning up...`);
            await db.order.delete({
                where: { id: created.id }
            });
            console.log(`Cleaned up test order.`);

            importedCount++;
        } catch (err: any) {
            console.error(`Error mapping PrintMarkt order:`, err);
            errorCount++;
        }
    }

    console.log(`Test completed. Successfully tested ${importedCount} insertions, ${errorCount} errors.`);
}

run().catch(console.error).finally(() => db.$disconnect());
