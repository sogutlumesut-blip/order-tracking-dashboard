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

        // Map Status
        let status = 'Gelen Siparişler' // Default to Incoming
        let labels: string[] = ['WooCommerce', 'Yeni'];

        if (body.status === 'processing') status = 'Gelen Siparişler'
        if (body.status === 'completed') status = 'Tamamlandı'
        if (body.status === 'on-hold') status = 'Müşteri Beklemede'
        if (body.status === 'pending') status = 'Müşteri Beklemede'

        // Handle Failed/Cancelled
        if (body.status === 'failed' || body.status === 'cancelled' || body.status === 'refunded') {
            status = 'Gelen Siparişler'; // Keep it in incoming so they see it
            labels.push('Ödeme Başarısız');
        }

        const customer = `${body.billing.first_name || ''} ${body.billing.last_name || ''}`.trim() || "Misafir"
        const phone = body.billing.phone
        const email = body.billing.email
        const address = `${body.billing.address_1 || ''} ${body.billing.address_2 || ''}`.trim()

        // City Logic
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

        let city = body.billing.city
        if (body.billing.state) {
            const stateName = getCityName(body.billing.state).toLocaleUpperCase('tr-TR');
            if (city && !city.toLocaleUpperCase('tr-TR').includes(stateName)) {
                city = `${city} / ${stateName}`;
            } else if (!city) {
                city = stateName;
            }
        }

        const total = `${body.total} ${body.currency_symbol || '₺'}`
        const note = body.customer_note
        const paymentMethod = body.payment_method_title || "Bilinmiyor"

        // Check if order exists (idempotency)
        // We use barcode field to store WC ID like "WC-12345"
        const existingOrder = await db.order.findUnique({
            where: { barcode: `WC-${wcId}` }
        })

        if (existingOrder) {
            // Optional: Update status if exists? 
            // For now, adhere to idempotency and just return success to stop retries
            return NextResponse.json({ message: "Order already exists" }, { status: 200 })
        }

        // Process Items
        const items = (body.line_items || []).map((item: any) => {
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

        // Cargo Integrator Data
        const cargoBarcodeMeta = body.meta_data.find((m: any) => m.key === '_gcargo_barcode_exposed')
        const cargoTrackingMeta = body.meta_data.find((m: any) => m.key === '_gcargo_tracking_exposed')

        const newOrder = await db.order.create({
            data: {
                customer,
                phone,
                email,
                address,
                city,
                total,
                status: status,
                date: new Date(body.date_created),
                updatedAt: new Date(body.date_modified),
                note,
                labels: JSON.stringify(labels),
                barcode: `WC-${wcId}`,
                paymentMethod,
                hasNotification: true, // CRITICAL FOR SOUND
                cargoBarcode: cargoBarcodeMeta ? cargoBarcodeMeta.value : null,
                cargoTrackingNumber: cargoTrackingMeta ? cargoTrackingMeta.value : null,
                items: {
                    create: items
                }
            }
        })

        // ADD "COMPLETED" LOG if applicable
        if (status === 'Tamamlandı') {
            await db.orderActivity.create({
                data: {
                    orderId: newOrder.id,
                    author: 'Sistem',
                    action: 'STATUS_CHANGE',
                    details: 'Müşteriye teslim edildi (WooCommerce Webhook)',
                }
            })
        }

        revalidatePath("/")
        return NextResponse.json({ success: true, message: "Order processed successfully", id: newOrder.id })

    } catch (error) {
        console.error("Webhook Error:", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
