// Helper utility for parsing Turkish City (İl) and District (İlçe)
// Especially vital for Shopify imports and DHL / Kargo Entegratör API calls

export interface ParsedLocation {
    city: string;      // e.g. "İstanbul"
    district: string;  // e.g. "Kadıköy"
    formattedCity: string; // e.g. "Kadıköy / İstanbul"
}

// 81 Official Provinces in Turkey (Upper and Title case mapping)
export const TURKISH_PROVINCES: Record<string, string> = {
    'ADANA': 'Adana',
    'ADIYAMAN': 'Adıyaman',
    'AFYONKARAHISAR': 'Afyonkarahisar',
    'AFYON': 'Afyonkarahisar',
    'AGRI': 'Ağrı',
    'AKSARAY': 'Aksaray',
    'AMASYA': 'Amasya',
    'ANKARA': 'Ankara',
    'ANTALYA': 'Antalya',
    'ARDAHAN': 'Ardahan',
    'ARTVIN': 'Artvin',
    'AYDIN': 'Aydın',
    'BALIKESIR': 'Balıkesir',
    'BARTIN': 'Bartın',
    'BATMAN': 'Batman',
    'BAYBURT': 'Bayburt',
    'BILECIK': 'Bilecik',
    'BINGOL': 'Bingöl',
    'BITLIS': 'Bitlis',
    'BOLU': 'Bolu',
    'BURDUR': 'Burdur',
    'BURSA': 'Bursa',
    'CANAKKALE': 'Çanakkale',
    'CANKIRI': 'Çankırı',
    'CORUM': 'Çorum',
    'DENIZLI': 'Denizli',
    'DIYARBAKIR': 'Diyarbakır',
    'DUZCE': 'Düzce',
    'EDIRNE': 'Edirne',
    'ELAZIG': 'Elazığ',
    'ERZINCAN': 'Erzincan',
    'ERZURUM': 'Erzurum',
    'ESKISEHIR': 'Eskişehir',
    'GAZIANTEP': 'Gaziantep',
    'ANTEP': 'Gaziantep',
    'GIRESUN': 'Giresun',
    'GUMUSHANE': 'Gümüşhane',
    'HAKKARI': 'Hakkari',
    'HATAY': 'Hatay',
    'IGDIR': 'Iğdır',
    'ISPARTA': 'Isparta',
    'ISTANBUL': 'İstanbul',
    'IZMIR': 'İzmir',
    'KAHRAMANMARAS': 'Kahramanmaraş',
    'MARAS': 'Kahramanmaraş',
    'KARABUK': 'Karabük',
    'KARAMAN': 'Karaman',
    'KARS': 'Kars',
    'KASTAMONU': 'Kastamonu',
    'KAYSERI': 'Kayseri',
    'KIRIKKALE': 'Kırıkkale',
    'KIRKLARELI': 'Kırklareli',
    'KIRSEHIR': 'Kırşehir',
    'KILIS': 'Kilis',
    'KOCAELI': 'Kocaeli',
    'IZMIT': 'Kocaeli',
    'KONYA': 'Konya',
    'KUTAHYA': 'Kütahya',
    'MALATYA': 'Malatya',
    'MANISA': 'Manisa',
    'MARDIN': 'Mardin',
    'MERSIN': 'Mersin',
    'ICEL': 'Mersin',
    'MUGLA': 'Muğla',
    'MUS': 'Muş',
    'NEVSEHIR': 'Nevşehir',
    'NIGDE': 'Niğde',
    'ORDU': 'Ordu',
    'OSMANIYE': 'Osmaniye',
    'RIZE': 'Rize',
    'SAKARYA': 'Sakarya',
    'ADAPAZARI': 'Sakarya',
    'SAMSUN': 'Samsun',
    'SIIRT': 'Siirt',
    'SINOP': 'Sinop',
    'SIVAS': 'Sivas',
    'SANLIURFA': 'Şanlıurfa',
    'URFA': 'Şanlıurfa',
    'SIRNAK': 'Şırnak',
    'TEKIRDAG': 'Tekirdağ',
    'TOKAT': 'Tokat',
    'TRABZON': 'Trabzon',
    'TUNCELI': 'Tunceli',
    'USAK': 'Uşak',
    'VAN': 'Van',
    'YALOVA': 'Yalova',
    'YOZGAT': 'Yozgat',
    'ZONGULDAK': 'Zonguldak'
};

// 30 Metropolitan Cities in Turkey do NOT have a "Merkez" district in DHL / MNG Cargo!
// If "Merkez" is passed for these cities, MNG API throws "Alıcı ilçe: Merkez için kod tespiti yapılamadı."
// We provide their primary central district fallback.
export const METROPOLITAN_DEFAULT_DISTRICT: Record<string, string> = {
    'Adana': 'Seyhan',
    'Ankara': 'Çankaya',
    'Antalya': 'Muratpaşa',
    'Aydın': 'Efeler',
    'Balıkesir': 'Karesi',
    'Bursa': 'Osmangazi',
    'Denizli': 'Pamukkale',
    'Diyarbakır': 'Yenişehir',
    'Erzurum': 'Yakutiye',
    'Eskişehir': 'Odunpazarı',
    'Gaziantep': 'Şahinbey',
    'Hatay': 'Antakya',
    'İstanbul': 'Kadıköy',
    'İzmir': 'Konak',
    'Kahramanmaraş': 'Onikişubat',
    'Kayseri': 'Melikgazi',
    'Kocaeli': 'İzmit',
    'Konya': 'Selçuklu',
    'Malatya': 'Battalgazi',
    'Manisa': 'Şehzadeler',
    'Mardin': 'Artuklu',
    'Mersin': 'Akdeniz',
    'Muğla': 'Menteşe',
    'Ordu': 'Altınordu',
    'Sakarya': 'Adapazarı',
    'Samsun': 'İlkadım',
    'Şanlıurfa': 'Haliliye',
    'Tekirdağ': 'Süleymanpaşa',
    'Trabzon': 'Ortahisar',
    'Van': 'İpekyolu'
};

// ISO TR codes mapping
export const TR_CODE_PROVINCES: Record<string, string> = {
    'TR01': 'Adana', 'TR02': 'Adıyaman', 'TR03': 'Afyonkarahisar', 'TR04': 'Ağrı', 'TR05': 'Amasya',
    'TR06': 'Ankara', 'TR07': 'Antalya', 'TR08': 'Artvin', 'TR09': 'Aydın', 'TR10': 'Balıkesir',
    'TR11': 'Bilecik', 'TR12': 'Bingöl', 'TR13': 'Bitlis', 'TR14': 'Bolu', 'TR15': 'Burdur',
    'TR16': 'Bursa', 'TR17': 'Çanakkale', 'TR18': 'Çankırı', 'TR19': 'Çorum', 'TR20': 'Denizli',
    'TR21': 'Diyarbakır', 'TR22': 'Edirne', 'TR23': 'Elazığ', 'TR24': 'Erzincan', 'TR25': 'Erzurum',
    'TR26': 'Eskişehir', 'TR27': 'Gaziantep', 'TR28': 'Giresun', 'TR29': 'Gümüşhane', 'TR30': 'Hakkari',
    'TR31': 'Hatay', 'TR32': 'Isparta', 'TR33': 'Mersin', 'TR34': 'İstanbul', 'TR35': 'İzmir',
    'TR36': 'Kars', 'TR37': 'Kastamonu', 'TR38': 'Kayseri', 'TR39': 'Kırklareli', 'TR40': 'Kırşehir',
    'TR41': 'Kocaeli', 'TR42': 'Konya', 'TR43': 'Kütahya', 'TR44': 'Malatya', 'TR45': 'Manisa',
    'TR46': 'Kahramanmaraş', 'TR47': 'Mardin', 'TR48': 'Muğla', 'TR49': 'Muş', 'TR50': 'Nevşehir',
    'TR51': 'Niğde', 'TR52': 'Ordu', 'TR53': 'Rize', 'TR54': 'Sakarya', 'TR55': 'Samsun',
    'TR56': 'Siirt', 'TR57': 'Sinop', 'TR58': 'Sivas', 'TR59': 'Tekirdağ', 'TR60': 'Tokat',
    'TR61': 'Trabzon', 'TR62': 'Tunceli', 'TR63': 'Şanlıurfa', 'TR64': 'Uşak', 'TR65': 'Van',
    'TR66': 'Yozgat', 'TR67': 'Zonguldak', 'TR68': 'Aksaray', 'TR69': 'Bayburt', 'TR70': 'Karaman',
    'TR71': 'Kırıkkale', 'TR72': 'Batman', 'TR73': 'Şırnak', 'TR74': 'Bartın', 'TR75': 'Ardahan',
    'TR76': 'Iğdır', 'TR77': 'Yalova', 'TR78': 'Karabük', 'TR79': 'Kilis', 'TR80': 'Osmaniye',
    'TR81': 'Düzce'
};

// Popular district / neighborhood to { province, district } mapping for smart fallback
export const POPULAR_DISTRICT_TO_PROVINCE: Record<string, { city: string; district: string }> = {
    // İstanbul
    'KADIKOY': { city: 'İstanbul', district: 'Kadıköy' },
    'USKUDAR': { city: 'İstanbul', district: 'Üsküdar' },
    'BESIKTAS': { city: 'İstanbul', district: 'Beşiktaş' },
    'ATASEHIR': { city: 'İstanbul', district: 'Ataşehir' },
    'UMRANIYE': { city: 'İstanbul', district: 'Ümraniye' },
    'BAKIRKOY': { city: 'İstanbul', district: 'Bakırköy' },
    'SISLI': { city: 'İstanbul', district: 'Şişli' },
    'MALTEPE': { city: 'İstanbul', district: 'Maltepe' },
    'KARTAL': { city: 'İstanbul', district: 'Kartal' },
    'PENDIK': { city: 'İstanbul', district: 'Pendik' },
    'TUZLA': { city: 'İstanbul', district: 'Tuzla' },
    'BEYOGLU': { city: 'İstanbul', district: 'Beyoğlu' },
    'FATIH': { city: 'İstanbul', district: 'Fatih' },
    'SARIYER': { city: 'İstanbul', district: 'Sarıyer' },
    'BEYKOZ': { city: 'İstanbul', district: 'Beykoz' },
    'CEKMEKOY': { city: 'İstanbul', district: 'Çekmeköy' },
    'SANCAKTEPE': { city: 'İstanbul', district: 'Sancaktepe' },
    'SULTANBEYLI': { city: 'İstanbul', district: 'Sultanbeyli' },
    'BASAKSEHIR': { city: 'İstanbul', district: 'Başakşehir' },
    'BEYLIKDUZU': { city: 'İstanbul', district: 'Beylikdüzü' },
    'ESENYURT': { city: 'İstanbul', district: 'Esenyurt' },
    'AVCILAR': { city: 'İstanbul', district: 'Avcılar' },
    'KUCUKCEKMECE': { city: 'İstanbul', district: 'Küçükçekmece' },
    'BUYUKCEKMECE': { city: 'İstanbul', district: 'Büyükçekmece' },
    'BAGCILAR': { city: 'İstanbul', district: 'Bağcılar' },
    'BAHCELIEVLER': { city: 'İstanbul', district: 'Bahçelievler' },
    'GUNGOREN': { city: 'İstanbul', district: 'Güngören' },
    'ZEYTINBURNU': { city: 'İstanbul', district: 'Zeytinburnu' },
    'GAZIOSMANPASA': { city: 'İstanbul', district: 'Gaziosmanpaşa' },
    'SULTANGAZI': { city: 'İstanbul', district: 'Sultangazi' },
    'EYUPSULTAN': { city: 'İstanbul', district: 'Eyüpsultan' },
    'EYUP': { city: 'İstanbul', district: 'Eyüpsultan' },
    'BAYRAMPASA': { city: 'İstanbul', district: 'Bayrampaşa' },
    'ESENLER': { city: 'İstanbul', district: 'Esenler' },
    'KAGITHANE': { city: 'İstanbul', district: 'Kağıthane' },
    'SILIVRI': { city: 'İstanbul', district: 'Silivri' },
    'CATALCA': { city: 'İstanbul', district: 'Çatalca' },
    'ARNAVUTKOY': { city: 'İstanbul', district: 'Arnavutköy' },
    'SILE': { city: 'İstanbul', district: 'Şile' },
    'ADALAR': { city: 'İstanbul', district: 'Adalar' },
    
    // Bursa
    'NILUFER': { city: 'Bursa', district: 'Nilüfer' },
    'ATAEVLER': { city: 'Bursa', district: 'Nilüfer' },
    'IHSANIYE': { city: 'Bursa', district: 'Nilüfer' },
    'OZLUCE': { city: 'Bursa', district: 'Nilüfer' },
    'GORUKLE': { city: 'Bursa', district: 'Nilüfer' },
    'BESEVLER': { city: 'Bursa', district: 'Nilüfer' },
    'BALAT': { city: 'Bursa', district: 'Nilüfer' },
    'OSMANGAZI': { city: 'Bursa', district: 'Osmangazi' },
    'YILDIRIM': { city: 'Bursa', district: 'Yıldırım' },
    'INEGOL': { city: 'Bursa', district: 'İnegöl' },
    'GEMLIK': { city: 'Bursa', district: 'Gemlik' },
    'MUDANYA': { city: 'Bursa', district: 'Mudanya' },
    'GURSU': { city: 'Bursa', district: 'Gürsu' },
    'KESTEL': { city: 'Bursa', district: 'Kestel' },
    'ORHANGAZI': { city: 'Bursa', district: 'Orhangazi' },
    'IZNIK': { city: 'Bursa', district: 'İznik' },
    'MUSTAFAKEMALPASA': { city: 'Bursa', district: 'Mustafakemalpaşa' },
    'KARACABEY': { city: 'Bursa', district: 'Karacabey' },
    'YENISEHIR': { city: 'Bursa', district: 'Yenişehir' },

    // Ankara
    'CANKAYA': { city: 'Ankara', district: 'Çankaya' },
    'KECIOREN': { city: 'Ankara', district: 'Keçiören' },
    'YENIMAHALLE': { city: 'Ankara', district: 'Yenimahalle' },
    'MAMAK': { city: 'Ankara', district: 'Mamak' },
    'ETIMESGUT': { city: 'Ankara', district: 'Etimesgut' },
    'SINCAN': { city: 'Ankara', district: 'Sincan' },
    'GOLBASI': { city: 'Ankara', district: 'Gölbaşı' },
    'ALTINDAG': { city: 'Ankara', district: 'Altındağ' },
    'PURSAKLAR': { city: 'Ankara', district: 'Pursaklar' },
    'BATIKENT': { city: 'Ankara', district: 'Yenimahalle' },
    'CAYYOLU': { city: 'Ankara', district: 'Çankaya' },
    'UMITKOY': { city: 'Ankara', district: 'Çankaya' },
    
    // İzmir
    'KONAK': { city: 'İzmir', district: 'Konak' },
    'KARSIYAKA': { city: 'İzmir', district: 'Karşıyaka' },
    'BORNOVA': { city: 'İzmir', district: 'Bornova' },
    'BUCA': { city: 'İzmir', district: 'Buca' },
    'CIGLI': { city: 'İzmir', district: 'Çiğli' },
    'GAZIEMIR': { city: 'İzmir', district: 'Gaziemir' },
    'KARABAGLAR': { city: 'İzmir', district: 'Karabağlar' },
    'BAYRAKLI': { city: 'İzmir', district: 'Bayraklı' },
    'BALCOVA': { city: 'İzmir', district: 'Balçova' },
    'NARLIDERE': { city: 'İzmir', district: 'Narlıdere' },
    'GUZELBAHCE': { city: 'İzmir', district: 'Güzelbahçe' },
    'URLA': { city: 'İzmir', district: 'Urla' },
    'CESME': { city: 'İzmir', district: 'Çeşme' },
    'TORBALI': { city: 'İzmir', district: 'Torbalı' },
    'MENEMEN': { city: 'İzmir', district: 'Menemen' },
    'ALIAGA': { city: 'İzmir', district: 'Aliağa' },
    'SEFERIHISAR': { city: 'İzmir', district: 'Seferihisar' },
    'MENDERES': { city: 'İzmir', district: 'Menderes' },
    'ALACATI': { city: 'İzmir', district: 'Çeşme' },
    
    // Antalya
    'MURATPASA': { city: 'Antalya', district: 'Muratpaşa' },
    'KEPEZ': { city: 'Antalya', district: 'Kepez' },
    'KONYAALTI': { city: 'Antalya', district: 'Konyaaltı' },
    'ALANYA': { city: 'Antalya', district: 'Alanya' },
    'MANAVGAT': { city: 'Antalya', district: 'Manavgat' },
    'SERIK': { city: 'Antalya', district: 'Serik' },
    'KEMER': { city: 'Antalya', district: 'Kemer' },
    'KAS': { city: 'Antalya', district: 'Kaş' },
    'KUMLUCA': { city: 'Antalya', district: 'Kumluca' },
    'DOSEMEALTI': { city: 'Antalya', district: 'Döşemealtı' },
    'AKSU': { city: 'Antalya', district: 'Aksu' },
    'LARA': { city: 'Antalya', district: 'Muratpaşa' },
    
    // Kocaeli
    'IZMIT': { city: 'Kocaeli', district: 'İzmit' },
    'GEBZE': { city: 'Kocaeli', district: 'Gebze' },
    'DARICA': { city: 'Kocaeli', district: 'Darıca' },
    'CAYIROVA': { city: 'Kocaeli', district: 'Çayırova' },
    'KORFEZ': { city: 'Kocaeli', district: 'Körfez' },
    'GOLCUK': { city: 'Kocaeli', district: 'Gölcük' },
    'KARTEPE': { city: 'Kocaeli', district: 'Kartepe' },
    'DERINCE': { city: 'Kocaeli', district: 'Derince' },
    'DILOVASI': { city: 'Kocaeli', district: 'Dilovası' },
    'BASISKELE': { city: 'Kocaeli', district: 'Başiskele' },
    
    // Muğla
    'BODRUM': { city: 'Muğla', district: 'Bodrum' },
    'FETHIYE': { city: 'Muğla', district: 'Fethiye' },
    'MARMARIS': { city: 'Muğla', district: 'Marmaris' },
    'MENTESE': { city: 'Muğla', district: 'Menteşe' },
    'MILAS': { city: 'Muğla', district: 'Milas' },
    'ORTACA': { city: 'Muğla', district: 'Ortaca' },
    'DATCA': { city: 'Muğla', district: 'Datça' }
};

export function normalizeTurkish(text: string): string {
    if (!text) return '';
    return text
        .trim()
        .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
        .replace(/ü/g, 'u').replace(/Ü/g, 'U')
        .replace(/ş/g, 's').replace(/Ş/g, 'S')
        .replace(/ı/g, 'i').replace(/İ/g, 'I')
        .replace(/ö/g, 'o').replace(/Ö/g, 'O')
        .replace(/ç/g, 'c').replace(/Ç/g, 'C')
        .toUpperCase();
}

export function toTitleCaseTr(text: string): string {
    if (!text) return '';
    return text
        .trim()
        .split(/\s+/)
        .map(word => {
            if (!word) return '';
            const first = word.charAt(0);
            const rest = word.slice(1);
            return first.toLocaleUpperCase('tr-TR') + rest.toLocaleLowerCase('tr-TR');
        })
        .join(' ');
}

/**
 * Intelligent parser that splits any combined city/district string into { city, district }
 * Handles formats like:
 * - "Merkez / Bursa" (Metropolitan fix: replaces invalid 'Merkez' with 'Nilüfer' or 'Osmangazi')
 * - "istanbul  kadıköy"
 * - "kadıköy istanbul"
 * - "kadıköy / istanbul"
 * - "istanbul / kadıköy"
 * - "kadıköy / istanbul / Turkey"
 * - "TR34" / "kadıköy"
 */
export function parseTurkishCityAndDistrict(cityInput?: string | null, addressInput?: string | null): ParsedLocation {
    const rawCity = (cityInput || '').trim();
    const rawAddress = (addressInput || '').trim();

    // Check for TR code first (e.g. TR34)
    if (TR_CODE_PROVINCES[rawCity.toUpperCase()]) {
        const prov = TR_CODE_PROVINCES[rawCity.toUpperCase()];
        const dist = METROPOLITAN_DEFAULT_DISTRICT[prov] || 'Merkez';
        return {
            city: prov,
            district: dist,
            formattedCity: `${dist} / ${prov}`
        };
    }

    // Clean out country keywords like "Turkey", "Türkiye", "TR"
    const cleanTokens = (str: string) => {
        return str
            .replace(/\b(turkey|turkiye|türkiye|tr)\b/gi, '')
            .replace(/[-/\\,;|]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const cleanedCity = cleanTokens(rawCity);
    const words = cleanedCity.split(' ').filter(Boolean);

    let detectedCity: string | null = null;
    let detectedDistrict: string | null = null;

    // 1. Check if any word or token in cityInput is a known district or neighborhood
    for (const w of words) {
        const normW = normalizeTurkish(w);
        if (normW !== 'MERKEZ' && POPULAR_DISTRICT_TO_PROVINCE[normW]) {
            detectedCity = POPULAR_DISTRICT_TO_PROVINCE[normW].city;
            detectedDistrict = POPULAR_DISTRICT_TO_PROVINCE[normW].district;
            break;
        }
    }

    // 2. Try to find a province name in the words of cleanedCity
    if (!detectedCity) {
        const normCityStr = normalizeTurkish(cleanedCity);
        for (const [key, val] of Object.entries(TURKISH_PROVINCES)) {
            const regex = new RegExp(`\\b${key}\\b`, 'i');
            if (regex.test(normCityStr)) {
                detectedCity = val;
                // The remaining text is likely the district
                const remaining = normCityStr.replace(regex, '').trim().replace(/\s+/g, ' ');
                if (remaining && normalizeTurkish(remaining) !== 'MERKEZ') {
                    const districtWords = words.filter(w => normalizeTurkish(w) !== key && normalizeTurkish(w) !== 'MERKEZ');
                    if (districtWords.length > 0) {
                        detectedDistrict = toTitleCaseTr(districtWords.join(' '));
                    }
                }
                break;
            }
        }
    }

    // 3. Scan rawAddress for known districts or neighborhoods (e.g. "Ataevler mah...")
    if (rawAddress) {
        const normAddr = normalizeTurkish(cleanTokens(rawAddress));
        for (const [distKey, distVal] of Object.entries(POPULAR_DISTRICT_TO_PROVINCE)) {
            const regex = new RegExp(`\\b${distKey}\\b`, 'i');
            if (regex.test(normAddr)) {
                // If city is already known, check if this district belongs to that city
                if (!detectedCity || detectedCity === distVal.city) {
                    detectedCity = distVal.city;
                    detectedDistrict = distVal.district;
                    break;
                }
            }
        }

        // If city still not found, check rawAddress for province name
        if (!detectedCity) {
            for (const [key, val] of Object.entries(TURKISH_PROVINCES)) {
                const regex = new RegExp(`\\b${key}\\b`, 'i');
                if (regex.test(normAddr)) {
                    detectedCity = val;
                    break;
                }
            }
        }
    }

    // 4. Default handling if province was found but district was not
    if (detectedCity && !detectedDistrict) {
        if (words.length > 0) {
            const normCityKey = normalizeTurkish(detectedCity);
            const remainingWords = words.filter(w => normalizeTurkish(w) !== normCityKey && normalizeTurkish(w) !== 'MERKEZ');
            if (remainingWords.length > 0) {
                detectedDistrict = toTitleCaseTr(remainingWords.join(' '));
            }
        }
    }

    // 5. Fallback if completely undetected
    if (!detectedCity) {
        if (rawCity.includes('/')) {
            const parts = rawCity.split('/').map(p => p.trim()).filter(Boolean);
            if (parts.length >= 2) {
                detectedDistrict = toTitleCaseTr(parts[0]);
                detectedCity = toTitleCaseTr(parts[1]);
            } else if (parts.length === 1) {
                detectedCity = toTitleCaseTr(parts[0]);
            }
        } else if (words.length >= 2) {
            detectedCity = toTitleCaseTr(words[0]);
            detectedDistrict = toTitleCaseTr(words.slice(1).join(' '));
        } else if (words.length === 1) {
            detectedCity = toTitleCaseTr(words[0]);
        }
    }

    let finalCity = detectedCity || 'İstanbul';
    let finalDistrict = detectedDistrict || '';

    // CRITICAL FIX: If district is empty or "Merkez" for a Metropolitan city, replace with primary district
    if (!finalDistrict || finalDistrict.toLowerCase() === 'merkez') {
        if (METROPOLITAN_DEFAULT_DISTRICT[finalCity]) {
            finalDistrict = METROPOLITAN_DEFAULT_DISTRICT[finalCity];
        } else {
            finalDistrict = 'Merkez';
        }
    }

    return {
        city: finalCity,
        district: finalDistrict,
        formattedCity: `${finalDistrict} / ${finalCity}`
    };
}
