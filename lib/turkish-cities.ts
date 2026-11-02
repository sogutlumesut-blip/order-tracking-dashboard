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

// ISO TR codes mapping
export const TR_CODE_PROVINCES: Record<string, string> = {
    'TR01': 'Adana', 'TR02': 'Adıyaman', 'TR03': 'Afyonkarahisar', 'TR04': 'Ağrı', 'TR05': 'Amasya',
    'TR06': 'Ankara', 'TR07': 'Antalya', 'TR08': 'Artvin', 'TR09': 'Aydın', 'TR10': 'Balıkesir',
    'TR11': 'Bilecik', 'TR12': 'Bİngöl', 'TR13': 'Bitlis', 'TR14': 'Bolu', 'TR15': 'Burdur',
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

// Popular district to province mapping for smart fallback
export const POPULAR_DISTRICT_TO_PROVINCE: Record<string, string> = {
    'KADIKOY': 'İstanbul',
    'USKUDAR': 'İstanbul',
    'BESIKTAS': 'İstanbul',
    'ATASEHIR': 'İstanbul',
    'UMRANIYE': 'İstanbul',
    'BAKIRKOY': 'İstanbul',
    'SISLI': 'İstanbul',
    'MALTEPE': 'İstanbul',
    'KARTAL': 'İstanbul',
    'PENDIK': 'İstanbul',
    'TUZLA': 'İstanbul',
    'BEYOGLU': 'İstanbul',
    'FATIH': 'İstanbul',
    'SARIYER': 'İstanbul',
    'BEYKOZ': 'İstanbul',
    'CEKMEKOY': 'İstanbul',
    'SANCAKTEPE': 'İstanbul',
    'SULTANBEYLI': 'İstanbul',
    'BASAKSEHIR': 'İstanbul',
    'BEYLIKDUZU': 'İstanbul',
    'ESENYURT': 'İstanbul',
    'AVCILAR': 'İstanbul',
    'KUCUKCEKMECE': 'İstanbul',
    'BUYUKCEKMECE': 'İstanbul',
    'BAGCILAR': 'İstanbul',
    'BAHCELIEVLER': 'İstanbul',
    'GUNGOREN': 'İstanbul',
    'ZEYTINBURNU': 'İstanbul',
    'GAZIOSMANPASA': 'İstanbul',
    'SULTANGAZI': 'İstanbul',
    'EYUPSULTAN': 'İstanbul',
    'EYUP': 'İstanbul',
    'BAYRAMPASA': 'İstanbul',
    'ESENLER': 'İstanbul',
    'KAGITHANE': 'İstanbul',
    'SILIVRI': 'İstanbul',
    'CATALCA': 'İstanbul',
    'ARNAVUTKOY': 'İstanbul',
    'SILE': 'İstanbul',
    'ADALAR': 'İstanbul',
    
    // Ankara
    'CANKAYA': 'Ankara',
    'KECIOREN': 'Ankara',
    'YENIMAHALLE': 'Ankara',
    'MAMAK': 'Ankara',
    'ETIMESGUT': 'Ankara',
    'SINCAN': 'Ankara',
    'GOLBASI': 'Ankara',
    'ALTINDAG': 'Ankara',
    'PURSAKLAR': 'Ankara',
    
    // İzmir
    'KONAK': 'İzmir',
    'KARSIYAKA': 'İzmir',
    'BORNOVA': 'İzmir',
    'BUCA': 'İzmir',
    'CIGLI': 'İzmir',
    'GAZIEMIR': 'İzmir',
    'KARABAGLAR': 'İzmir',
    'BAYRAKLI': 'İzmir',
    'BALCOVA': 'İzmir',
    'NARLIDERE': 'İzmir',
    'GUZELBAHCE': 'İzmir',
    'URLA': 'İzmir',
    'CESME': 'İzmir',
    'TORBALI': 'İzmir',
    'MENEMEN': 'İzmir',
    'ALIAGA': 'İzmir',
    
    // Antalya
    'MURATPASA': 'Antalya',
    'KEPEZ': 'Antalya',
    'KONYAALTI': 'Antalya',
    'ALANYA': 'Antalya',
    'MANAVGAT': 'Antalya',
    'SERIK': 'Antalya',
    'KEMER': 'Antalya',
    'KAS': 'Antalya',
    'KUMLUCA': 'Antalya',
    
    // Bursa
    'NILUFER': 'Bursa',
    'OSMANGAZI': 'Bursa',
    'YILDIRIM': 'Bursa',
    'INEGOL': 'Bursa',
    'GEMLIK': 'Bursa',
    'MUDANYA': 'Bursa',
    
    // Kocaeli
    'GEBZE': 'Kocaeli',
    'DARICA': 'Kocaeli',
    'CAYIROVA': 'Kocaeli',
    'KORFEZ': 'Kocaeli',
    'GOLCUK': 'Kocaeli',
    'KARTEPE': 'Kocaeli',
    'DERINCE': 'Kocaeli',
    'DILOVASI': 'Kocaeli',
    
    // Muğla
    'BODRUM': 'Muğla',
    'FETHIYE': 'Muğla',
    'MARMARIS': 'Muğla',
    'MENTESE': 'Muğla',
    'MILAS': 'Muğla',
    'ORTACA': 'Muğla',
    'DATCA': 'Muğla'
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
        return {
            city: TR_CODE_PROVINCES[rawCity.toUpperCase()],
            district: 'Merkez',
            formattedCity: `Merkez / ${TR_CODE_PROVINCES[rawCity.toUpperCase()]}`
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

    // 1. Try to find a province name in the words of cleanedCity
    // We check multi-word provinces first (e.g. KAHRAMANMARAS, AFYONKARAHISAR) then single words
    const normCityStr = normalizeTurkish(cleanedCity);

    for (const [key, val] of Object.entries(TURKISH_PROVINCES)) {
        // Exact match of word boundary
        const regex = new RegExp(`\\b${key}\\b`, 'i');
        if (regex.test(normCityStr)) {
            detectedCity = val;
            // The remaining text is likely the district
            const remaining = normCityStr.replace(regex, '').trim().replace(/\s+/g, ' ');
            if (remaining) {
                // Find matching original casing in words
                const districtWords = words.filter(w => normalizeTurkish(w) !== key);
                detectedDistrict = toTitleCaseTr(districtWords.join(' '));
            }
            break;
        }
    }

    // 2. If no province found directly, check if any word is a known popular district
    if (!detectedCity) {
        for (const w of words) {
            const normW = normalizeTurkish(w);
            if (POPULAR_DISTRICT_TO_PROVINCE[normW]) {
                detectedCity = POPULAR_DISTRICT_TO_PROVINCE[normW];
                detectedDistrict = toTitleCaseTr(w);
                break;
            }
        }
    }

    // 3. If still no province found, scan rawAddress for a province
    if (!detectedCity && rawAddress) {
        const normAddr = normalizeTurkish(cleanTokens(rawAddress));
        for (const [key, val] of Object.entries(TURKISH_PROVINCES)) {
            const regex = new RegExp(`\\b${key}\\b`, 'i');
            if (regex.test(normAddr)) {
                detectedCity = val;
                break;
            }
        }
        if (!detectedCity) {
            for (const [distKey, provVal] of Object.entries(POPULAR_DISTRICT_TO_PROVINCE)) {
                const regex = new RegExp(`\\b${distKey}\\b`, 'i');
                if (regex.test(normAddr)) {
                    detectedCity = provVal;
                    if (!detectedDistrict) detectedDistrict = toTitleCaseTr(distKey);
                    break;
                }
            }
        }
    }

    // 4. Default handling if province was found but district was not
    if (detectedCity && !detectedDistrict) {
        if (words.length > 0) {
            const normCityKey = normalizeTurkish(detectedCity);
            const remainingWords = words.filter(w => normalizeTurkish(w) !== normCityKey);
            if (remainingWords.length > 0) {
                detectedDistrict = toTitleCaseTr(remainingWords.join(' '));
            }
        }
        if (!detectedDistrict && rawAddress) {
            // Check address for known districts
            const normAddr = normalizeTurkish(rawAddress);
            for (const distKey of Object.keys(POPULAR_DISTRICT_TO_PROVINCE)) {
                const regex = new RegExp(`\\b${distKey}\\b`, 'i');
                if (regex.test(normAddr)) {
                    detectedDistrict = toTitleCaseTr(distKey);
                    break;
                }
            }
        }
        if (!detectedDistrict) {
            detectedDistrict = 'Merkez';
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
                detectedDistrict = 'Merkez';
            }
        } else if (words.length >= 2) {
            detectedCity = toTitleCaseTr(words[0]);
            detectedDistrict = toTitleCaseTr(words.slice(1).join(' '));
        } else if (words.length === 1) {
            detectedCity = toTitleCaseTr(words[0]);
            detectedDistrict = 'Merkez';
        } else {
            detectedCity = 'İstanbul';
            detectedDistrict = 'Merkez';
        }
    }

    const finalCity = detectedCity || 'İstanbul';
    const finalDistrict = detectedDistrict || 'Merkez';

    return {
        city: finalCity,
        district: finalDistrict,
        formattedCity: `${finalDistrict} / ${finalCity}`
    };
}
