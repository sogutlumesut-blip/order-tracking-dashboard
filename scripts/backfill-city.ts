import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
    const settings = await db.systemSetting.findMany()
    const config = settings.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {} as Record<string, string>)
    const auth = Buffer.from(`${config.wc_key}:${config.wc_secret}`).toString('base64')

    const orders = await db.order.findMany({
        where: {
            barcode: { startsWith: 'WC-' }
        }
    })

    console.log(`Found ${orders.length} WC orders to check.`)

    // City Mapping Logic (TR Code -> Name)
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

    for (const order of orders) {
        if (!order.barcode) continue
        const wcId = order.barcode.replace('WC-', '')

        try {
            const res = await fetch(`${config.wc_url}/wp-json/wc/v3/orders/${wcId}`, {
                headers: { Authorization: `Basic ${auth}` }
            })

            if (!res.ok) {
                // Log error or continue. Some orders might be missing if deleted remotely but kept locally?
                console.log(`Could not fetch order ${wcId}`)
                continue;
            }

            const wcOrder = await res.json()

            let city = wcOrder.billing.city
            let updated = false
            if (wcOrder.billing.state) {
                const stateName = getCityName(wcOrder.billing.state).toLocaleUpperCase('tr-TR');

                if (city && !city.toLocaleUpperCase('tr-TR').includes(stateName)) {
                    city = `${city} / ${stateName}`;
                    updated = true
                } else if (!city) {
                    city = stateName;
                    updated = true
                } else if (city.toLocaleUpperCase('tr-TR') !== order.city?.toLocaleUpperCase('tr-TR')) {
                    // If our logic would result in same city but maybe original import was different case?
                    // Just trust the new logic.
                    updated = true
                }
            }

            if (updated && city !== order.city) {
                await db.order.update({
                    where: { id: order.id },
                    data: { city: city }
                })
                console.log(`Updated city for Order ${wcId}: ${city}`)
            }

        } catch (e) {
            console.error(`Failed to update ${wcId}`, e)
        }
    }
}

main()
    .finally(async () => {
        await db.$disconnect()
    })
