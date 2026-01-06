import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
    const settings = await db.systemSetting.findMany()
    const config = settings.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {} as Record<string, string>)
    const auth = Buffer.from(`${config.wc_key}:${config.wc_secret}`).toString('base64')

    const orders = await db.order.findMany({
        where: {
            barcode: { startsWith: 'WC-' }
        },
        include: {
            items: true
        }
    })

    console.log(`Found ${orders.length} WC orders to check.`)

    for (const order of orders) {
        if (!order.barcode) continue
        const wcId = order.barcode.replace('WC-', '')

        try {
            const res = await fetch(`${config.wc_url}/wp-json/wc/v3/orders/${wcId}`, {
                headers: { Authorization: `Basic ${auth}` }
            })

            if (!res.ok) continue
            const wcOrder = await res.json()

            let updatedCount = 0;
            for (let i = 0; i < (wcOrder.line_items || []).length; i++) {
                const wcItem = wcOrder.line_items[i]

                if (order.items[i]) {
                    const dbItem = order.items[i]

                    // [DEBUG] Log available keys
                    console.log(`Order ${wcId} Item ${i} Keys:`, wcItem.meta_data.map((m: any) => m.key).join(", "))

                    // Helper to find meta value
                    const getMeta = (keys: string[]) => {
                        if (!Array.isArray(wcItem.meta_data)) return null;
                        const found = wcItem.meta_data.find((m: any) => keys.includes(m.key) || keys.includes(m.display_key));
                        return found ? (found.display_value || found.value) : null;
                    }

                    // Material Mapping
                    // Try to find any key containing "Malzeme" or "Kağıt" if exact match fails
                    let material = getMeta(['pa_doku', 'Nitelik', 'Malzeme', 'Kağıt Türü', 'Kağıt Cinsi', 'Material', 'Paper Type']);
                    if (!material) {
                        const fuzzyMatch = wcItem.meta_data.find((m: any) => m.key.toLowerCase().includes('kağıt') || m.key.toLowerCase().includes('malzeme'));
                        if (fuzzyMatch) material = fuzzyMatch.display_value || fuzzyMatch.value;
                    }

                    // Dimensions & Area Mapping
                    let dimensions = getMeta(['Boyut', 'Ölçüler', 'Dimensions', 'Ebat', 'Size', 'Ölçüleriniz', 'Sipariş Ölçüsü']);

                    // Fallback: Construct from Width/Height (Genişlik/Yükseklik)
                    if (!dimensions) {
                        const width = getMeta(['Genişlik', 'Width']);
                        const height = getMeta(['Yükseklik', 'Height']);
                        const unit = getMeta(['Birim', 'Unit']) || '';
                        if (width && height) {
                            dimensions = `${width} x ${height} ${unit}`.trim();
                        }
                    }

                    const area = getMeta(['Toplam Ölçü', 'Toplam Alan', 'Area', 'Metrekare', 'm2', 'Total Size']);

                    let cleanArea = area ? area.replace(/<[^>]*>?/gm, '') : null;

                    // Fallback Calculation for Area if missing but we have dimensions like "225 x 145 cm"
                    if (!cleanArea && dimensions) {
                        const match = dimensions.match(/(\d+)\s*[xX]\s*(\d+)/);
                        if (match && match[1] && match[2]) {
                            const w = parseFloat(match[1]);
                            const h = parseFloat(match[2]);
                            // Assume cm -> m2
                            const m2 = (w * h) / 10000;
                            if (!isNaN(m2) && m2 > 0) {
                                cleanArea = `${m2.toFixed(2)} m²`;
                            }
                        }
                    }

                    if (cleanArea) {
                        // Avoid duplicating area if it's already in dimensions
                        if (!dimensions || !dimensions.includes(cleanArea)) {
                            dimensions = dimensions ? `${dimensions} (${cleanArea})` : cleanArea;
                        }
                    }

                    // Check for changes (Material, Dimensions, SKU)
                    // Note: dbItem.sku might not exist on type yet if generated client isn't fully refreshed in script context, 
                    // but we pushed schema so it should be fine if we trust dynamic access or if we updated client.
                    // To be safe we cast to any or check keys.

                    const sku = wcItem.sku || null;
                    const url = getMeta(['Özel Url', 'Dosya Linki', 'File Link', 'Drive Link', 'Link']) || null;

                    // Cast to any to access potentially new fields if types aren't fully refreshed in script context
                    if (material !== dbItem.material || dimensions !== dbItem.dimensions || sku !== (dbItem as any).sku || url !== (dbItem as any).url) {
                        await db.orderItem.update({
                            where: { id: dbItem.id },
                            data: {
                                material: material || dbItem.material,
                                dimensions: dimensions || dbItem.dimensions,
                                sku: sku, // Update SKU
                                url: url  // Update URL
                            }
                        })
                        updatedCount++
                    }
                }
            }
            if (updatedCount > 0) console.log(`Updated details for Order ${wcId}`)

        } catch (e) {
            console.error(`Failed to update ${wcId}`, e)
        }
    }
}

main()
    .finally(async () => {
        await db.$disconnect()
    })
