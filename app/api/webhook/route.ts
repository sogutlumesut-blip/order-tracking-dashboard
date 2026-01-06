import { NextResponse } from "next/server"
import { db } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function POST(req: Request) {
    try {
        const text = await req.text()

        // Handle WooCommerce "Ping" (sent as form-urlencoded: webhook_id=123)
        if (text.startsWith("webhook_id=")) {
            return NextResponse.json({ message: "Webhook ping received" }, { status: 200 })
        }

        const body = JSON.parse(text)

        // Basic validation
        if (!body.id || !body.billing) {
            return NextResponse.json({ message: "Invalid payload" }, { status: 400 })
        }

        // WooCommerce Payload Fields
        const wcId = body.id
        const customer = `${body.billing.first_name || ''} ${body.billing.last_name || ''}`.trim() || "Misafir"
        const phone = body.billing.phone
        const email = body.billing.email
        const address = body.billing.address_1
        const city = body.billing.city
        const total = `${body.total} ₺` // Assuming TRY
        const note = body.customer_note
        const paymentMethod = body.payment_method_title || "Bilinmiyor"

        // Check if order exists (idempotency)
        // We use barcode field to store WC ID like "WC-12345"
        const existingOrder = await db.order.findUnique({
            where: { barcode: `WC-${wcId}` }
        })

        if (existingOrder) {
            return NextResponse.json({ message: "Order already exists" }, { status: 200 })
        }

        // Process Items
        const items = body.line_items?.map((item: any) => {
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

            // Image Extraction Logic
            let imageSrc = item.image?.src;

            if (!imageSrc) {
                // Expanded Search for Image
                const metaImgRaw = item.meta_data?.find((m: any) => {
                    const k = normalizeKey(m.key || '');
                    // Check broad terms for Bayi/Plugin fields
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
                name: item.name,
                quantity: item.quantity,
                image_src: imageSrc,
                sku: item.sku || getMeta(['Stok Kodu', 'SKU', '_stok_kodu', 'Urun Kodu', 'Kod', 'Product Code', '_sku']) || null,
                dimensions: dimensions || "Ölçü Belirtilmedi",
                material: material || "Standart Kağıt"
            }
        }) || []

        await db.order.create({
            data: {
                customer,
                phone,
                email,
                address,
                city,
                total,
                status: "pending",
                note,
                labels: JSON.stringify(["WooCommerce", "Yeni"]),
                barcode: `WC-${wcId}`,
                paymentMethod,
                items: {
                    create: items
                }
            }
        })

        revalidatePath("/")
        return NextResponse.json({ success: true, message: "Order processed successfully" })

    } catch (error) {
        console.error("Webhook Error:", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
