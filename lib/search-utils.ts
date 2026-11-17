/**
 * Utilities for Turkish and Latin case-insensitive, diacritic-insensitive,
 * and token-based search across orders.
 */

export function normalizeTurkishForSearch(text: any): string {
    if (text === null || text === undefined) return "";
    return String(text)
        .replace(/İ/g, "i")
        .replace(/I/g, "i")
        .replace(/ı/g, "i")
        .replace(/Ş/g, "s")
        .replace(/ş/g, "s")
        .replace(/Ğ/g, "g")
        .replace(/ğ/g, "g")
        .replace(/Ü/g, "u")
        .replace(/ü/g, "u")
        .replace(/Ö/g, "o")
        .replace(/ö/g, "o")
        .replace(/Ç/g, "c")
        .replace(/ç/g, "c")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Checks whether an order matches a search query.
 * - Single word (e.g. "ahmet" matches "Ahmet Yılmaz")
 * - Multi-word / First + Last name (e.g. "ahmet yılmaz" matches "Ahmet Can Yılmaz")
 * - Case & Turkish diacritics insensitive ("IŞIK", "ışık", "isik", "İsmail", "ismail")
 * - ID match (supports "#1065" or "1065")
 * - Phone match (supports digits / formatted)
 * - Barcode, Tracking Number, Cargo Barcode, Email
 * - Product / Item names and SKUs
 */
export function matchOrderSearch(order: any, searchTerm: string): boolean {
    if (!searchTerm || !searchTerm.trim()) return true;

    const normQuery = normalizeTurkishForSearch(searchTerm);
    if (!normQuery) return true;

    const queryTokens = normQuery.split(" ").filter(Boolean);
    if (queryTokens.length === 0) return true;

    const normCustomer = normalizeTurkishForSearch(order.customer);

    // 1. Customer name matches all tokens in query (Ad / Soyad / Ad Soyad)
    const allTokensInCustomer = queryTokens.every(token => normCustomer.includes(token));
    if (allTokensInCustomer) return true;

    // 2. Exact or substring match on ID / Barcode / Tracking / Phone
    const cleanQuery = normQuery.replace(/^[#\s]+/, "");
    const orderIdStr = order.id ? String(order.id) : "";
    const extId = order.externalId ? normalizeTurkishForSearch(order.externalId) : "";
    if (cleanQuery && (orderIdStr.includes(cleanQuery) || extId.includes(cleanQuery))) {
        return true;
    }

    // Phone matching (digits)
    const queryDigits = normQuery.replace(/\D/g, "");
    const orderPhone = order.phone ? String(order.phone).replace(/\D/g, "") : "";
    if (queryDigits.length >= 3 && orderPhone.includes(queryDigits)) {
        return true;
    }

    const normBarcode = normalizeTurkishForSearch(order.barcode);
    const tracking = normalizeTurkishForSearch(order.trackingNumber);
    const cargoTracking = normalizeTurkishForSearch(order.cargoTrackingNumber);
    const email = normalizeTurkishForSearch(order.email);

    if (normBarcode.includes(normQuery) || 
        tracking.includes(normQuery) || 
        cargoTracking.includes(normQuery) || 
        email.includes(normQuery)) {
        return true;
    }

    // 3. Match across entire order content (items, products, skus, notes)
    const itemNames = (order.items || []).map((i: any) => normalizeTurkishForSearch(i.name)).join(" ");
    const itemSkus = (order.items || []).map((i: any) => normalizeTurkishForSearch(i.sku)).join(" ");
    const notes = normalizeTurkishForSearch(order.note);

    const combined = `${normCustomer} ${orderIdStr} ${extId} ${orderPhone} ${normBarcode} ${email} ${tracking} ${cargoTracking} ${itemNames} ${itemSkus} ${notes}`;
    return queryTokens.every(token => combined.includes(token));
}

/**
 * Generates character and casing variants for PostgreSQL query filtering.
 * Bridges Postgres default ILIKE collation limitations with Turkish characters.
 */
export function getSearchVariants(term: string): string[] {
    if (!term || !term.trim()) return [];
    const set = new Set<string>();
    const trimmed = term.trim();

    set.add(trimmed);
    try {
        set.add(trimmed.toLocaleLowerCase("tr-TR"));
        set.add(trimmed.toLocaleUpperCase("tr-TR"));
    } catch {}
    set.add(trimmed.toLowerCase());
    set.add(trimmed.toUpperCase());

    // Latin ASCII transliteration
    const ascii = trimmed
        .replace(/İ/g, "I")
        .replace(/ı/g, "i")
        .replace(/Ş/g, "S")
        .replace(/ş/g, "s")
        .replace(/Ğ/g, "G")
        .replace(/ğ/g, "g")
        .replace(/Ü/g, "U")
        .replace(/ü/g, "u")
        .replace(/Ö/g, "O")
        .replace(/ö/g, "o")
        .replace(/Ç/g, "C")
        .replace(/ç/g, "c");
    set.add(ascii);
    set.add(ascii.toLowerCase());
    set.add(ascii.toUpperCase());

    // Turkish transliteration
    const trified = ascii.toLowerCase()
        .replace(/i/g, "ı")
        .replace(/s/g, "ş")
        .replace(/g/g, "ğ")
        .replace(/u/g, "ü")
        .replace(/o/g, "ö")
        .replace(/c/g, "ç");
    set.add(trified);
    try {
        set.add(trified.toLocaleUpperCase("tr-TR"));
    } catch {}

    const titleCase = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "";
    set.add(titleCase(trimmed));
    set.add(titleCase(ascii));
    set.add(titleCase(trified));

    return Array.from(set).filter(s => s && s.length > 0);
}
