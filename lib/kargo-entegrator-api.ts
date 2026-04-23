const API_KEY = process.env.KARGO_ENTEGRATOR_API_KEY || "OylOoz2vKllZtByiBAbl65NpdsnaNPVlpVTRzgNte8e42427";
const BASE_URL = "https://app.kargoentegrator.com/api";
const CARGO_INTEGRATION_ID = 1220;
const WAREHOUSE_ID = 41;

export async function createKargoEntegratorShipment(order: any, items: any[]) {
    const headers = {
        "Authorization": `Bearer ${API_KEY}`,
        "Accept": "application/json",
        "Content-Type": "application/json"
    };

    let il = "Bilinmiyor";
    let ilce = "Bilinmiyor";
    if (order.city && order.city.includes('/')) {
        const parts = order.city.split('/');
        il = parts[parts.length - 1].trim();
        ilce = parts[0].trim();
    } else if (order.city) {
        il = order.city;
        ilce = order.district || "Bilinmiyor";
    }

    const nameParts = (order.customer || "").trim().split(' ');
    const surname = nameParts.length > 1 ? nameParts.pop() : "Müşteri";
    const name = nameParts.join(' ') || "Müşteri";
    
    const phone = (order.phone || "05550000000").replace(/[^0-9+]/g, '');
    const cleanTotal = parseFloat(String(order.total).replace(/[^0-9.]/g, '')) || 0;

    const payload = {
        cargo_integration_id: CARGO_INTEGRATION_ID,
        warehouse_id: WAREHOUSE_ID,
        customer: {
            name: name,
            surname: surname,
            phone: phone,
            email: order.email || "info@duvarkagidimarketi.com",
            country: "TR",
            postcode: "",
            city: il,
            district: ilce,
            address: order.address || "Adres Bilinmiyor"
        },
        payment_type: "credit_card",
        package_type: "box",
        payor_type: "sender",
        is_pay_at_door: false,
        total: cleanTotal,
        currency: "TRY",
        desi: 1,
        platform_id: order.externalId || String(order.id),
        platform_d_id: String(order.id),
        note: order.note || "",
        lines: items.map((item: any) => ({
            title: item.name,
            quantity: item.quantity,
            platform_id: String(item.id),
            image: "",
            sku: item.sku || "SKU"
        }))
    };

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 seconds
        
        let res;
        try {
            res = await fetch(`${BASE_URL}/shipments`, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
                signal: controller.signal
            });
        } catch (fetchErr: any) {
            clearTimeout(timeoutId);
            if (fetchErr.name === 'AbortError') {
                return { error: "Kargo Entegratör servisi (Gönderi Oluşturma) yanıt vermedi. Lütfen tekrar deneyin." };
            }
            throw fetchErr;
        }
        clearTimeout(timeoutId);

        if (!res.ok) {
            const errText = await res.text();
            console.error("Kargo Entegratör API Error:", res.status, errText);
            try {
                const parsed = JSON.parse(errText);
                return { error: parsed.message || JSON.stringify(parsed.errors) || "Bilinmeyen API Hatası" };
            } catch {
                return { error: `API Hatası (${res.status}): ${errText}` };
            }
        }

        const data = await res.json();
        const shipmentId = data?.data?.id;
        const barcode = data?.data?.barcode;

        if (!shipmentId) {
            return { error: "API gönderiyi oluşturdu ancak ID dönemedi." };
        }

        // Fetch PDF
        const pdfController = new AbortController();
        const pdfTimeoutId = setTimeout(() => pdfController.abort(), 15000); // 15 seconds
        
        let pdfRes;
        try {
            pdfRes = await fetch(`${BASE_URL}/print-pdf?shipments[0]=${shipmentId}`, {
                headers,
                signal: pdfController.signal
            });
            clearTimeout(pdfTimeoutId);
        } catch (pdfErr: any) {
            clearTimeout(pdfTimeoutId);
            console.error("PDF fetch timeout or error:", pdfErr);
        }

        let pdfBase64 = null;
        if (pdfRes && pdfRes.ok) {
            const arrayBuffer = await pdfRes.arrayBuffer();
            pdfBase64 = `data:application/pdf;base64,${Buffer.from(arrayBuffer).toString('base64')}`;
        } else if (pdfRes) {
            console.error("Kargo Entegratör PDF API Error:", pdfRes.status, await pdfRes.text());
        }

        return {
            success: true,
            barcode: barcode || String(shipmentId),
            shipmentId: shipmentId,
            labelPdfBase64: pdfBase64
        };
    } catch (e: any) {
        console.error("Kargo Entegratör Network Error:", e);
        return { error: `Bağlantı Hatası: ${e.message}` };
    }
}
