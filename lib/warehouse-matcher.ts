// Helper to clean SKU
export function normalizeSku(sku: string | null | undefined): string {
    if (!sku) return "";
    return sku.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

export function matchSku(
    orderSku: string | null | undefined,
    orderName: string | null | undefined,
    stockSku: string | null | undefined
): boolean {
    const s2 = normalizeSku(stockSku);
    if (!s2 || s2 === "bilinmiyor" || s2 === "unknown") return false;

    const s1 = normalizeSku(orderSku);
    if (s1 && s1 !== "bilinmiyor" && s1 !== "unknown") {
        if (s1 === s2) return true;
        if (s1.startsWith(s2) || s2.startsWith(s1)) return true;
        if (s2.length >= 4 && s1.includes(s2)) return true;
        if (s1.length >= 4 && s2.includes(s1)) return true;
    }

    if (orderName && s2.length >= 4) {
        const nNorm = normalizeSku(orderName);
        if (nNorm.includes(s2)) return true;
    }

    return false;
}

// Helper to clean material / texture
export function normalizeMaterial(mat: string | null | undefined): string {
    if (!mat) return "";
    return mat.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

export function detectMaterialCategory(
    matStr?: string | null,
    skuStr?: string | null,
    nameStr?: string | null
): string | null {
    const combined = `${matStr || ""} ${skuStr || ""} ${nameStr || ""}`.toLowerCase();
    
    // Non-Woven / Dokusuz
    const isNW = combined.includes("non-woven") || combined.includes("non woven") || combined.includes("nonwoven") ||
                 combined.includes("dokusuz") || combined.includes("-nw-") || combined.includes("-nw") ||
                 combined.match(/(?:^|[^a-z0-9])nw(?:[^a-z0-9]|$)/);
    if (isNW) return "non_woven";

    // Peel & Stick / Kendiliğinden Yapışkanlı Folyo
    const isPS = combined.includes("peel") || combined.includes("stick") || combined.includes("yapışkan") ||
                 combined.includes("folyo") || combined.includes("-ps-") || combined.includes("-ps") ||
                 combined.match(/(?:^|[^a-z0-9])ps(?:[^a-z0-9]|$)/);
    if (isPS) return "peel_stick";

    // Textured / Dokulu / Tekstil
    const isTextured = combined.includes("tekstil") || combined.includes("textured") || combined.includes("dokulu") ||
                       combined.includes("canvas") || combined.includes("vinyl") || combined.includes("vinil");
    if (isTextured) return "textured";

    // Standard / Kağıt
    if (combined.includes("kağıt") || combined.includes("paper") || combined.includes("klasik")) {
        return "standard_paper";
    }

    return null;
}

export function matchMaterial(
    mat1: string | null | undefined,
    mat2: string | null | undefined,
    sku1?: string | null,
    sku2?: string | null,
    name1?: string | null
): boolean {
    if (!mat1 && !sku1 && !name1) return false;
    if (!mat2 && !sku2) return false;

    const cat1 = detectMaterialCategory(mat1, sku1, name1);
    const cat2 = detectMaterialCategory(mat2, sku2, null);

    if (cat1 && cat2 && cat1 === cat2) {
        return true;
    }

    // Direct normalized string match fallback
    const m1 = normalizeMaterial(mat1);
    const m2 = normalizeMaterial(mat2);
    if (m1 && m2) {
        if (m1 === m2 || m1.includes(m2) || m2.includes(m1)) return true;
    }

    return false;
}

// Helper to extract dimensions [w, h]
export function parseDimensions(dimStr: string | null | undefined): { w: number; h: number; isInch: boolean; raw: string } | null {
    if (!dimStr) return null;
    const str = dimStr.toLowerCase().replace(/,/g, ".").trim();
    if (!str || str === "bilinmiyor" || str === "unknown") return null;

    // Detect unit
    const isExplicitInch = str.includes("inch") || str.includes("\"") || str.includes("''") || str.includes("in");
    const isExplicitCm = str.includes("cm");

    // Case 1: 90" W x 60" H or 90 W 60 H or 90W x 60H
    const whMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:\"|'')?\s*w\s*[^0-9]*\s*(\d+(?:\.\d+)?)\s*(?:\"|'')?\s*h/);
    if (whMatch) {
        return {
            w: parseFloat(whMatch[1]),
            h: parseFloat(whMatch[2]),
            isInch: isExplicitInch || !isExplicitCm,
            raw: dimStr
        };
    }

    // Case 2: 60" H x 90" W or 80 L x 120 W (Length/Height first, then Width)
    const hwMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:\"|'')?\s*[hl]\s*[^0-9]*\s*(\d+(?:\.\d+)?)\s*(?:\"|'')?\s*w/);
    if (hwMatch) {
        return {
            w: parseFloat(hwMatch[2]),
            h: parseFloat(hwMatch[1]),
            isInch: isExplicitInch || !isExplicitCm,
            raw: dimStr
        };
    }

    // Case 3: 150 W 108 H
    const spaceMatch = str.match(/(\d+(?:\.\d+)?)\s*w\s+(\d+(?:\.\d+)?)\s*h/);
    if (spaceMatch) {
        return {
            w: parseFloat(spaceMatch[1]),
            h: parseFloat(spaceMatch[2]),
            isInch: isExplicitInch || !isExplicitCm,
            raw: dimStr
        };
    }

    // Case 4: Standard 90x60 or 150 x 108 or 185 x 240 cm
    const clean = str.replace(/\"|''/g, " ");
    const generalMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:cm|inch|in)?\s*[x*]\s*(\d+(?:\.\d+)?)/);
    if (generalMatch) {
        const d1 = parseFloat(generalMatch[1]);
        const d2 = parseFloat(generalMatch[2]);
        if (d1 > 0 && d2 > 0) {
            const isInch = isExplicitInch || (!isExplicitCm && d1 <= 160 && d2 <= 160 && (str.includes("w") || str.includes("h")));
            return {
                w: d1,
                h: d2,
                isInch,
                raw: dimStr
            };
        }
    }

    return null;
}

export function extractDimensions(dimStr: string | null | undefined): [number, number] | null {
    const p = parseDimensions(dimStr);
    return p ? [p.w, p.h] : null;
}

export interface DimensionMatchResult {
    isMatch: boolean;
    matchType: "exact" | "close_smaller" | "none";
    description: string;
    stockDim?: { w: number; h: number; isInch: boolean };
    orderDim?: { w: number; h: number; isInch: boolean };
}

export function checkDimensionMatch(
    stockDimStr: string | null | undefined,
    orderDimStr: string | null | undefined
): DimensionMatchResult {
    const s = parseDimensions(stockDimStr);
    const o = parseDimensions(orderDimStr);

    if (!s || !o) {
        const sNorm = (stockDimStr || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const oNorm = (orderDimStr || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        if (sNorm && oNorm && sNorm === oNorm) {
            return {
                isMatch: true,
                matchType: "exact",
                description: `Birebir Aynı Ölçü (${stockDimStr})`
            };
        }
        return {
            isMatch: false,
            matchType: "none",
            description: "Ölçüler okunamadı"
        };
    }

    // Normalize units if one is cm and one is inch
    let sw = s.w, sh = s.h, ow = o.w, oh = o.h;
    if (s.isInch && !o.isInch && (ow > 150 || oh > 150)) {
        ow = ow / 2.54;
        oh = oh / 2.54;
    } else if (!s.isInch && o.isInch && (sw > 150 || sh > 150)) {
        ow = ow * 2.54;
        oh = oh * 2.54;
    }

    // 1. Exact match check (tolerance: 1 unit)
    const isExactNormal = Math.abs(sw - ow) <= 1 && Math.abs(sh - oh) <= 1;
    const isExactRotated = Math.abs(sw - oh) <= 1 && Math.abs(sh - ow) <= 1;

    if (isExactNormal || isExactRotated) {
        return {
            isMatch: true,
            matchType: "exact",
            description: `Birebir Aynı Ölçü (${stockDimStr})`,
            stockDim: s,
            orderDim: o
        };
    }

    // 2. Order larger check ("büyük olduğunda bildirme")
    // If order is bigger than stock in width or height, cannot be used!
    const fitsNormal = (ow <= sw + 0.5) && (oh <= sh + 0.5);
    const fitsRotated = (oh <= sw + 0.5) && (ow <= sh + 0.5);

    if (!fitsNormal && !fitsRotated) {
        return {
            isMatch: false,
            matchType: "none",
            description: "Sipariş ölçüsü depodaki stoktan daha büyük"
        };
    }

    // 3. Order is smaller, check if close enough (not a tiny sample)
    const isCloseNormal = fitsNormal && (ow >= sw * 0.55) && (oh >= sh * 0.55);
    const isCloseRotated = fitsRotated && (oh >= sw * 0.55) && (ow >= sh * 0.55);

    if (isCloseNormal || isCloseRotated) {
        return {
            isMatch: true,
            matchType: "close_smaller",
            description: `Depo: ${stockDimStr} | Sipariş: ${orderDimStr} (Depodaki ürün daha büyük, kesilerek kullanılabilir)`,
            stockDim: s,
            orderDim: o
        };
    }

    return {
        isMatch: false,
        matchType: "none",
        description: "Sipariş depodaki stoğa göre çok küçük (numune)"
    };
}

export function matchDimensions(dim1: string | null | undefined, dim2: string | null | undefined): boolean {
    return checkDimensionMatch(dim2, dim1).isMatch;
}

export interface StockMatchResult {
    isMatch: boolean;
    matchType?: "exact" | "close_smaller";
    description?: string;
    orderDimensions?: string | null;
}

export function checkStockMatch(
    orderItem: { sku?: string | null; name?: string | null; dimensions?: string | null; material?: string | null },
    stock: { sku: string; dimensions: string; material: string }
): StockMatchResult {
    // 1. SKU match
    if (!matchSku(orderItem.sku, orderItem.name, stock.sku)) {
        return { isMatch: false };
    }

    // 2. Material match
    if (!matchMaterial(orderItem.material, stock.material, orderItem.sku, stock.sku, orderItem.name)) {
        return { isMatch: false };
    }

    // 3. Dimension match (exact or close smaller, reject if bigger)
    const dimResult = checkDimensionMatch(stock.dimensions, orderItem.dimensions);
    if (!dimResult.isMatch) {
        return { isMatch: false };
    }

    return {
        isMatch: true,
        matchType: dimResult.matchType as "exact" | "close_smaller",
        description: dimResult.description,
        orderDimensions: orderItem.dimensions || null
    };
}

export function isStockMatch(
    orderItem: { sku?: string | null; name?: string | null; dimensions?: string | null; material?: string | null },
    stock: { sku: string; dimensions: string; material: string }
): boolean {
    return checkStockMatch(orderItem, stock).isMatch;
}
