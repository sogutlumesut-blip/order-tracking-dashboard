const DEFAULT_API_KEY = process.env.FATURA_ENTEGRATOR_API_KEY || "B5vGGIao5mNpy6tVApxzG0dPBQbhxZ7gAkR2iIjZ8af6b95f";
const KARGO_KEY_CONFLICT = "OylOoz2vKllZtByiBAbl65NpdsnaNPVlpVTRzgNte8e42427";
const BASE_URL = "https://app.faturaentegrator.com/api";
const DEFAULT_INVOICE_INTEGRATION_ID = 297; // EDM Hesabım
const DEFAULT_SALE_CHANNEL_ID = 390; // WordPress

export function getFaturaEntegratorApiKey(feAppKey?: string | null): string {
    if (feAppKey && feAppKey.trim() !== "" && feAppKey.trim() !== KARGO_KEY_CONFLICT) {
        return feAppKey.trim();
    }
    return DEFAULT_API_KEY;
}

function parseOrderTotal(totalStr: string | number | null | undefined): number {
    if (typeof totalStr === "number") return totalStr;
    if (!totalStr) return 0;
    const cleaned = String(totalStr).replace(/[^0-9.,]/g, "").trim();
    if (!cleaned) return 0;
    if (cleaned.includes(".") && cleaned.includes(",")) {
        if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
            return parseFloat(cleaned.replace(/\./g, "").replace(",", ".")) || 0;
        } else {
            return parseFloat(cleaned.replace(/,/g, "")) || 0;
        }
    }
    if (cleaned.includes(",")) {
        return parseFloat(cleaned.replace(",", ".")) || 0;
    }
    return parseFloat(cleaned) || 0;
}

function formatIstanbulDateTime(date: Date = new Date()): { dateStr: string; timeStr: string } {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Istanbul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).formatToParts(date);

    const get = (type: string) => parts.find(p => p.type === type)?.value || "00";
    const year = get("year");
    const month = get("month");
    const day = get("day");
    const hour = get("hour") === "24" ? "00" : get("hour");
    const minute = get("minute");

    return {
        dateStr: `${year}-${month}-${day}`,
        timeStr: `${hour}:${minute}`
    };
}

export async function fetchFaturaEntegratorInvoice(invoiceId: number | string, feAppKey?: string | null) {
    const apiKey = getFaturaEntegratorApiKey(feAppKey);
    const res = await fetch(`${BASE_URL}/invoices/${invoiceId}`, {
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Accept": "application/json"
        },
        cache: "no-store"
    });
    if (!res.ok) {
        return null;
    }
    const json = await res.json();
    return json?.data || null;
}

export async function findExistingInvoiceForOrder(orderKey: string, feAppKey?: string | null) {
    try {
        const apiKey = getFaturaEntegratorApiKey(feAppKey);
        const res = await fetch(`${BASE_URL}/invoices?per_page=30`, {
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Accept": "application/json"
            },
            cache: "no-store"
        });
        if (!res.ok) return null;
        const json = await res.json();
        const list = Array.isArray(json?.data) ? json.data : [];
        return list.find((inv: any) =>
            (String(inv.order_id) === String(orderKey) || String(inv.order_d_id) === String(orderKey)) &&
            inv.formal_status !== "failed" &&
            inv.workflow_status !== "failed"
        ) || null;
    } catch {
        return null;
    }
}

export async function createFaturaEntegratorInvoice(
    order: any,
    items: any[],
    settings: Record<string, string | undefined> = {}
) {
    const apiKey = getFaturaEntegratorApiKey(settings.fe_app_key);
    const headers = {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
        "Content-Type": "application/json"
    };

    const externalOrderId = String(order.externalId || order.id);

    // 1. Check if a valid invoice already exists in Fatura Entegratör for this order
    const existing = await findExistingInvoiceForOrder(externalOrderId, settings.fe_app_key);
    if (existing && existing.id) {
        return {
            success: true,
            invoiceId: existing.id,
            pdfUrl: existing.pdf_url || `/api/invoice-pdf/${order.id}?feId=${existing.id}`,
            serialNumber: existing.serial_number || null
        };
    }

    // 2. Parse City / District
    let il = "İstanbul";
    let ilce = "Merkez";
    if (order.city && order.city.includes("/")) {
        const parts = order.city.split("/");
        il = parts[parts.length - 1].trim() || "İstanbul";
        ilce = parts[0].trim() || "Merkez";
    } else if (order.city) {
        il = order.city.trim();
        ilce = order.district || order.city.trim();
    }

    if ((ilce === "Merkez" || ilce === "Bilinmiyor") && order.address) {
        const addressMatch = order.address.match(/([a-zA-ZçğıöşüÇĞİÖŞÜ\s]+)\s*\/\s*([a-zA-ZçğıöşüÇĞİÖŞÜ\s]+)$/);
        if (addressMatch) {
            ilce = addressMatch[1].trim();
            il = addressMatch[2].trim();
        }
    }

    // 3. Parse Customer Name & Tax Info
    const rawCustomer = (order.customer || "Müşteri").replace(/\n/g, " ").trim();
    const nameParts = rawCustomer.split(/\s+/);
    const surname = nameParts.length > 1 ? nameParts.pop()! : "Müşteri";
    const name = nameParts.join(" ") || "Müşteri";

    const rawTaxNumber = String(order.taxNumber || "11111111111").replace(/[^0-9]/g, "");
    const taxNumber = rawTaxNumber.length === 10 || rawTaxNumber.length === 11 ? rawTaxNumber : "11111111111";
    const isCompany = taxNumber.length === 10;
    const taxOffice = order.taxOffice ? String(order.taxOffice).trim() : "";
    const phone = (order.phone || "").replace(/[^0-9+]/g, "");

    // 4. Build invoice lines (try WooCommerce exact line items first if WooCommerce order)
    let lines: any[] = [];
    if (order.source === "woo" && order.externalId && settings.wc_url && settings.wc_key && settings.wc_secret) {
        try {
            const wcAuth = Buffer.from(`${settings.wc_key}:${settings.wc_secret}`).toString("base64");
            const baseUrl = settings.wc_url.replace(/\/$/, "");
            const wcRes = await fetch(`${baseUrl}/wp-json/wc/v3/orders/${order.externalId}`, {
                headers: { Authorization: `Basic ${wcAuth}` },
                signal: AbortSignal.timeout(8000)
            });
            if (wcRes.ok) {
                const wcOrder = await wcRes.json();
                if (Array.isArray(wcOrder.line_items) && wcOrder.line_items.length > 0) {
                    for (const li of wcOrder.line_items) {
                        const qty = Number(li.quantity) || 1;
                        const subtotalExclTax = parseFloat(li.subtotal) || 0;
                        const totalExclTax = parseFloat(li.total) || 0;
                        const unitPriceExclTax = Number((subtotalExclTax / qty).toFixed(6));
                        const discountExclTax = Math.max(0, Number((subtotalExclTax - totalExclTax).toFixed(2)));

                        const lineObj: any = {
                            id: String(li.product_id || li.id || lines.length + 1),
                            name: li.name || "Duvar Kağıdı",
                            quantity: qty,
                            unit: "C62",
                            unit_price: unitPriceExclTax,
                            tax_rate: 20
                        };
                        if (discountExclTax > 0) {
                            lineObj.discount_type = "amount";
                            lineObj.discount = discountExclTax;
                        }
                        lines.push(lineObj);
                    }
                    const shippingTotal = parseFloat(wcOrder.shipping_total) || 0;
                    if (shippingTotal > 0) {
                        lines.push({
                            id: "shipping",
                            name: "Kargo",
                            quantity: 1,
                            unit: "C62",
                            unit_price: Number(shippingTotal.toFixed(6)),
                            tax_rate: 20
                        });
                    }
                }
            }
        } catch (e) {
            console.warn("[FATURA_ENTEGRATOR] WooCommerce order fetch fallback:", e);
        }
    }

    // Fallback to OMS order items & total if lines not populated from WooCommerce
    if (lines.length === 0) {
        const grandTotalInclTax = parseOrderTotal(order.total);
        const safeItems = Array.isArray(items) && items.length > 0
            ? items
            : [{ id: 1, name: "Duvar Kağıdı", quantity: 1 }];

        const totalQty = safeItems.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0) || 1;
        const unitPriceInclTax = grandTotalInclTax > 0 ? grandTotalInclTax / totalQty : 100;
        const unitPriceExclTax = Number((unitPriceInclTax / 1.2).toFixed(6));

        lines = safeItems.map((item: any, idx: number) => ({
            id: String(item.sku || item.id || idx + 1),
            name: item.name || "Duvar Kağıdı",
            quantity: Number(item.quantity) || 1,
            unit: "C62",
            unit_price: unitPriceExclTax,
            tax_rate: 20
        }));
    }

    // 5. Dates & Payment Info
    const nowIstanbul = formatIstanbulDateTime(new Date());
    const orderDateObj = order.date ? new Date(order.date) : new Date();
    const orderIstanbul = formatIstanbulDateTime(isNaN(orderDateObj.getTime()) ? new Date() : orderDateObj);

    const paymentMethodRaw = (order.paymentMethod || "").toLowerCase();
    const isBankTransfer = paymentMethodRaw.includes("havale") || paymentMethodRaw.includes("eft") || paymentMethodRaw.includes("banka");
    const paymentMethodCode = isBankTransfer ? "direct_transfer" : "credit_or_debit";
    const paymentPlatform = order.paymentMethod || (isBankTransfer ? "Havale / EFT" : "Kredi Banka Kartı (PayTR)");

    const payload: any = {
        sale_channel_id: DEFAULT_SALE_CHANNEL_ID,
        invoice_integration_id: DEFAULT_INVOICE_INTEGRATION_ID,
        type: "SATIS",
        issue_date: nowIstanbul.dateStr,
        issue_time: nowIstanbul.timeStr,
        order_id: externalOrderId,
        order_d_id: externalOrderId,
        order_created_at: orderIstanbul.dateStr,
        payment_date: orderIstanbul.dateStr,
        cash_sale: true,
        currency: "TRY",
        currency_rate: 1,
        description: "İRSALİYE YERİNE GEÇERLİDİR",
        customer: {
            id: externalOrderId,
            type: isCompany ? "company" : "person",
            title: isCompany ? rawCustomer : null,
            name: name,
            surname: surname,
            tax_number: taxNumber,
            tax_office: taxOffice || null,
            country: "Türkiye",
            city: il,
            district: ilce,
            address: order.address || "Adres Bilinmiyor",
            phone: phone || null,
            email: order.email || null
        },
        lines,
        is_need_shipment: true,
        shipment: {
            company_title: "DHL LOJİSTİK HİZMETLERİ A.Ş.",
            company_tax_number: "6230098998",
            delivery_date: orderIstanbul.dateStr
        },
        is_internet_sale: true,
        internet_sale: {
            web_address: "https://duvarkagidimarketi.com",
            payment_method: paymentMethodCode,
            payment_platform: paymentPlatform,
            payment_date: orderIstanbul.dateStr
        }
    };

    try {
        const res = await fetch(`${BASE_URL}/invoices`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(20000)
        });

        const resText = await res.text();
        if (!res.ok) {
            console.error("[FATURA_ENTEGRATOR] Error:", res.status, resText);
            try {
                const parsed = JSON.parse(resText);
                const errDetails = parsed.errors
                    ? Object.values(parsed.errors).flat().join(", ")
                    : parsed.message || "Fatura Entegratör API Hatası";
                return { error: errDetails };
            } catch {
                return { error: `Fatura Entegratör Hatası (${res.status}): ${resText.substring(0, 200)}` };
            }
        }

        const data = JSON.parse(resText);
        const createdInvoice = data?.data || data;
        const feInvoiceId = createdInvoice?.id;

        if (!feInvoiceId) {
            return { error: "Fatura Entegratör yanıtında fatura ID bulunamadı." };
        }

        let pdfUrl: string | null = createdInvoice?.pdf_url || null;
        let serialNumber: string | null = createdInvoice?.serial_number || null;

        // Poll up to ~15 seconds to see if EDM finishes formalizing right away
        if (!pdfUrl) {
            for (let i = 0; i < 6; i++) {
                await new Promise(r => setTimeout(r, 2500));
                const check = await fetchFaturaEntegratorInvoice(feInvoiceId, settings.fe_app_key);
                if (check) {
                    if (check.pdf_url) {
                        pdfUrl = check.pdf_url;
                        serialNumber = check.serial_number || serialNumber;
                        break;
                    }
                    if (check.formal_status === "failed" || check.workflow_status === "failed") {
                        const errMsg = check.errors?.[0]?.message || "EDM fatura resmileştirme hatası.";
                        return { error: `Fatura resmileştirilemedi: ${errMsg}` };
                    }
                }
            }
        }

        // Always provide our smart proxy URL if pdf_url is still being generated in the background queue,
        // or the direct pdfUrl if already finalized
        const finalUrl = pdfUrl || `/api/invoice-pdf/${order.id}?feId=${feInvoiceId}`;

        return {
            success: true,
            invoiceId: feInvoiceId,
            pdfUrl: finalUrl,
            serialNumber
        };
    } catch (e: any) {
        console.error("[FATURA_ENTEGRATOR] Network Error:", e);
        return { error: `Fatura Entegratör bağlantı hatası: ${e.message}` };
    }
}
