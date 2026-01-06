
const wcOrder = {
    "id": 104589,
    "line_items": [
        {
            "id": 22195,
            "name": "Özel Sipariş Ürün - 1",
            "quantity": 1,
            "meta_data": [
                { "id": 264413, "key": "Nitelik", "value": "Tekstil Duvar Kağıdı" },
                { "id": 264415, "key": "Stok Kodu", "value": "WP0046_DTX_CUST-W570H250" },
                { "id": 264414, "key": "Özel Url", "value": "https://drive.google.com/drive/folders/1WLt6rFcOGQoZu_v8N9pC3nAv0gMg6RlQ?usp=drive_link" },
                { "id": 264416, "key": "Genişlik", "value": "570" },
                { "id": 264419, "key": "Yükseklik", "value": "250" },
                { "id": 264420, "key": "Birim", "value": "cm" },
                { "id": 264421, "key": "Toplam Ölçü", "value": "14,25 m<sup>2</sup>" },
                { "id": 264423, "key": "Ürün Görselleri", "value": "<br><div style=\"display:block;width:100%;margin:22px 0px 0px 0px;\"><a style=\"margin:2px\" href=\"\" target=\"_blank\"><img style=\"margin:4px 8px 4px 0px;display:block;\" width=\"100\" height=\"100\" style=\"width:100px;height:100px;\"  src=\"\" /></a></div>" }
            ],
            "image": { "id": "", "src": "" }
        }
    ]
};

function parseOrder(wcOrder: any) {
    const items = (wcOrder.line_items || []).map((item: any) => {
        // Normalize helper: lowercase, trim, remove accents
        const normalizeKey = (k: string) => {
            return k.toLowerCase()
                .replace(/ğ/g, 'g')
                .replace(/ü/g, 'u')
                .replace(/ş/g, 's')
                .replace(/ı/g, 'i')
                .replace(/ö/g, 'o')
                .replace(/ç/g, 'c')
                .trim();
        }

        // Helper to find meta value with robust matching
        const getMeta = (keys: string[]) => {
            if (!Array.isArray(item.meta_data)) return null;

            const normKeys = keys.map(normalizeKey);
            const found = item.meta_data.find((m: any) => {
                const mKey = normalizeKey(m.key || '');
                const mDisplay = normalizeKey(m.display_key || '');
                // console.log(`Checking ${mKey} against [${normKeys.join(', ')}]`);
                return normKeys.includes(mKey) || normKeys.includes(mDisplay);
            });

            let val = found ? (found.display_value || found.value) : null;

            // Strip HTML tags and entities
            if (val && typeof val === 'string') {
                val = val
                    .replace(/<[^>]*>?/gm, '') // Remove tags
                    .replace(/&nbsp;/g, ' ')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&amp;/g, '&')
                    .replace(/sup&gt;/g, '')
                    .replace(/&sup2;/g, '2');
            }
            return val;
        }

        console.log(`Processing Item: ${item.name}`);
        console.log(`Keys available:`, item.meta_data.map((m: any) => normalizeKey(m.key)));

        // Image Logic
        let imageSrc = item.image?.src;
        if (!imageSrc) {
            const metaImgRaw = item.meta_data?.find((m: any) => m.key === 'Ürün Görselleri');
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
        if (!imageSrc) imageSrc = "PLACEHOLDER";

        // Material Logic
        // keys: 'pa_doku', 'Nitelik', 'Malzeme' ...
        const material = getMeta(['pa_doku', 'Nitelik', 'Malzeme', 'Kagit Turu', 'Kagit Cinsi', 'Material', 'Paper Type']);

        // Dimensions Logic
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

        const sku = item.sku || getMeta(['Stok Kodu', 'SKU', '_stok_kodu']);

        console.log("--- RESULTS ---");
        console.log("SKU:", sku);
        console.log("Material:", material);
        console.log("Dimensions:", dimensions);
        console.log("Image:", imageSrc);
        console.log("URL:", getMeta(['Ozel Url', 'Dosya Linki']));

        return { material, dimensions, image_src: imageSrc, sku };
    });
    return items;
}

parseOrder(wcOrder);
