// Helper to clean SKU
export function normalizeSku(sku: string | null | undefined): string {
    if (!sku) return "";
    return sku.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

// Helper to extract dimensions [w, h]
export function extractDimensions(dimStr: string | null | undefined): [number, number] | null {
    if (!dimStr) return null;
    const clean = dimStr.replace(/''|"/g, " ").replace(/,/g, ".");
    const match = clean.match(/(\d+(?:\.\d+)?)\s*[^0-9]*?\s*[x*wW]\s*[^0-9]*?\s*(\d+(?:\.\d+)?)/);
    if (match) {
        const d1 = parseFloat(match[1]);
        const d2 = parseFloat(match[2]);
        if (!isNaN(d1) && !isNaN(d2) && d1 > 0 && d2 > 0) {
            return [d1, d2];
        }
    }
    return null;
}

// Helper to check dimension equality
export function matchDimensions(dim1: string | null | undefined, dim2: string | null | undefined): boolean {
    if (!dim1 || !dim2) return false;
    const d1 = extractDimensions(dim1);
    const d2 = extractDimensions(dim2);
    if (d1 && d2) {
        // Direct match or rotated match
        return (d1[0] === d2[0] && d1[1] === d2[1]) || (d1[0] === d2[1] && d1[1] === d2[0]);
    }
    // Fallback: direct string comparison normalized
    const s1 = dim1.toLowerCase().replace(/[^a-z0-9]/g, "");
    const s2 = dim2.toLowerCase().replace(/[^a-z0-9]/g, "");
    return s1 === s2 && s1.length > 0;
}

// Helper to clean material / texture
export function normalizeMaterial(mat: string | null | undefined): string {
    if (!mat) return "";
    return mat.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

export function matchMaterial(mat1: string | null | undefined, mat2: string | null | undefined): boolean {
    if (!mat1 || !mat2) return false;
    const m1 = normalizeMaterial(mat1);
    const m2 = normalizeMaterial(mat2);
    if (!m1 || !m2) return false;
    if (m1 === m2) return true;
    if (m1.includes(m2) || m2.includes(m1)) return true;

    // Common synonyms
    const isNW1 = m1.includes("nonwoven");
    const isNW2 = m2.includes("nonwoven");
    if (isNW1 && isNW2) return true;

    const isPS1 = m1.includes("peelandstick") || m1.includes("peelstick");
    const isPS2 = m2.includes("peelandstick") || m2.includes("peelstick");
    if (isPS1 && isPS2) return true;

    return false;
}

export function isStockMatch(orderItem: { sku?: string | null; dimensions?: string | null; material?: string | null },
                             stock: { sku: string; dimensions: string; material: string }): boolean {
    // 1. SKU match
    const sku1 = normalizeSku(orderItem.sku);
    const sku2 = normalizeSku(stock.sku);
    if (!sku1 || !sku2) return false;
    const skuMatches = sku1 === sku2 || sku1.startsWith(sku2) || sku2.startsWith(sku1);
    if (!skuMatches) return false;

    // 2. Dimension match
    if (!matchDimensions(orderItem.dimensions, stock.dimensions)) return false;

    // 3. Material match
    if (!matchMaterial(orderItem.material, stock.material)) return false;

    return true;
}
