// Polyfill Web APIs required by modern pdfjs / pdf-parse in Node.js / Serverless environments
if (typeof (globalThis as any).DOMMatrix === "undefined") {
    class DOMMatrix {
        a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
        m11 = 1; m12 = 0; m13 = 0; m14 = 0;
        m21 = 0; m22 = 1; m23 = 0; m24 = 0;
        m31 = 0; m32 = 0; m33 = 1; m34 = 0;
        m41 = 0; m42 = 0; m43 = 0; m44 = 1;
        is2D = true;
        isIdentity = true;

        constructor(init?: any) {
            if (Array.isArray(init)) {
                if (init.length === 6) {
                    this.a = init[0]; this.b = init[1];
                    this.c = init[2]; this.d = init[3];
                    this.e = init[4]; this.f = init[5];
                    this.m11 = init[0]; this.m12 = init[1];
                    this.m21 = init[2]; this.m22 = init[3];
                    this.m41 = init[4]; this.m42 = init[5];
                } else if (init.length === 16) {
                    this.m11 = init[0]; this.m12 = init[1]; this.m13 = init[2]; this.m14 = init[3];
                    this.m21 = init[4]; this.m22 = init[5]; this.m23 = init[6]; this.m24 = init[7];
                    this.m31 = init[8]; this.m32 = init[9]; this.m33 = init[10]; this.m34 = init[11];
                    this.m41 = init[12]; this.m42 = init[13]; this.m43 = init[14]; this.m44 = init[15];
                    this.a = init[0]; this.b = init[1]; this.c = init[4]; this.d = init[5];
                    this.e = init[12]; this.f = init[13];
                    this.is2D = false;
                }
            } else if (init && typeof init === "object") {
                Object.assign(this, init);
            }
        }

        translate(tx = 0, ty = 0) {
            const copy = new DOMMatrix(this);
            copy.e += tx * copy.a + ty * copy.c;
            copy.f += tx * copy.b + ty * copy.d;
            return copy;
        }

        scale(sx = 1, sy = sx) {
            const copy = new DOMMatrix(this);
            copy.a *= sx; copy.m11 *= sx;
            copy.b *= sx; copy.m12 *= sx;
            copy.c *= sy; copy.m21 *= sy;
            copy.d *= sy; copy.m22 *= sy;
            return copy;
        }

        multiply(other: any) {
            return new DOMMatrix([
                this.a * (other?.a ?? 1) + this.c * (other?.b ?? 0),
                this.b * (other?.a ?? 1) + this.d * (other?.b ?? 0),
                this.a * (other?.c ?? 0) + this.c * (other?.d ?? 1),
                this.b * (other?.c ?? 0) + this.d * (other?.d ?? 1),
                this.a * (other?.e ?? 0) + this.c * (other?.f ?? 0) + this.e,
                this.b * (other?.e ?? 0) + this.d * (other?.f ?? 0) + this.f
            ]);
        }

        multiplySelf(other: any) {
            const res = this.multiply(other);
            Object.assign(this, res);
            return this;
        }

        preMultiplySelf(other: any) {
            const res = other ? (typeof other.multiply === "function" ? other.multiply(this) : new DOMMatrix(other).multiply(this)) : this;
            Object.assign(this, res);
            return this;
        }

        invertSelf() {
            const det = this.a * this.d - this.b * this.c;
            if (!det) return this;
            const invDet = 1 / det;
            const a = this.d * invDet;
            const b = -this.b * invDet;
            const c = -this.c * invDet;
            const d = this.a * invDet;
            const e = (this.c * this.f - this.d * this.e) * invDet;
            const f = (this.b * this.e - this.a * this.f) * invDet;
            this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f;
            return this;
        }

        inverse() {
            const copy = new DOMMatrix(this);
            return copy.invertSelf();
        }

        setTransform(other: any) {
            if (other) Object.assign(this, other);
            return this;
        }

        static fromMatrix(other: any) {
            return new DOMMatrix(other);
        }
    }

    (globalThis as any).DOMMatrix = DOMMatrix;
    if (typeof global !== "undefined") {
        (global as any).DOMMatrix = DOMMatrix;
    }
}

if (typeof (globalThis as any).Path2D === "undefined") {
    class Path2D {
        constructor(_init?: any) {}
        addPath() {}
        closePath() {}
        moveTo() {}
        lineTo() {}
        bezierCurveTo() {}
        quadraticCurveTo() {}
        arc() {}
        arcTo() {}
        ellipse() {}
        rect() {}
    }
    (globalThis as any).Path2D = Path2D;
    if (typeof global !== "undefined") {
        (global as any).Path2D = Path2D;
    }
}

if (typeof (globalThis as any).ImageData === "undefined") {
    class ImageData {
        width: number;
        height: number;
        data: Uint8ClampedArray;
        constructor(width: number, height: number) {
            this.width = width;
            this.height = height;
            this.data = new Uint8ClampedArray((width || 1) * (height || 1) * 4);
        }
    }
    (globalThis as any).ImageData = ImageData;
    if (typeof global !== "undefined") {
        (global as any).ImageData = ImageData;
    }
}

export interface ParsedReturnForm {
    sku: string | null;
    dimensions: string | null;
    material: string | null;
    orderNo: string | null;
    source: string;
    returnReason: string | null;
    rawText?: string;
}

// Helper to decompose structured ReturnForm filenames
// Examples:
// 0209_BessieHadjigeorghi_peelandstick_4046123579_ReturnForms.pdf
// 1802_KarenNach_3889833331_SH1114-P_ReturnForms.pdf
// 0209_WayFair_JimPidcock_NonWoven_CS673263650_ReturnForms.pdf
export function parseFromFileName(fileName: string) {
    if (!fileName) return {};
    const clean = fileName.replace(/\.pdf$/i, "");
    const parts = clean.split("_");

    let source: string | null = null;
    let material: string | null = null;
    let orderNo: string | null = null;
    let sku: string | null = null;
    let customer: string | null = null;

    for (const part of parts) {
        if (!part) continue;
        const lower = part.toLowerCase();
        if (lower === "returnforms" || lower === "return" || lower === "form" || lower === "forms") continue;
        if (/^\d{4}$/.test(part)) continue; // date prefix like 0209, 1802

        // Source detection
        if (!source && (lower.includes("wayfair") || lower.includes("printmarkt") || lower.includes("woo") || lower.includes("etsy") || lower.includes("shopify"))) {
            if (lower.includes("wayfair")) source = "Wayfair";
            else if (lower.includes("printmarkt")) source = "PrintMarkt";
            else if (lower.includes("woo")) source = "WooCommerce";
            else if (lower.includes("etsy")) source = "Etsy";
            else if (lower.includes("shopify")) source = "Shopify";
            continue;
        }

        // Material detection
        if (!material && (lower.includes("nonwoven") || lower.includes("peel") || lower.includes("textured") || lower.includes("canvas") || lower.includes("vinyl") || lower.includes("vinil"))) {
            if (lower.includes("nonwoven")) material = "Non Woven";
            else if (lower.includes("peel")) material = "Peel & Stick";
            else if (lower.includes("textured")) material = "Textured";
            else if (lower.includes("canvas")) material = "Canvas";
            else if (lower.includes("vinil") || lower.includes("vinyl")) material = "Vinyl";
            continue;
        }

        // Order Number (5-12 digits or CS... or PO...)
        if (!orderNo && (/^CS\d{5,}/i.test(part) || /^PO\d{5,}/i.test(part) || /^\d{5,12}$/.test(part))) {
            orderNo = part;
            continue;
        }

        // SKU (alphanumeric code containing both letters and digits, excluding CS/PO prefixes)
        if (!sku && /^[A-Z0-9]{2,6}(?:-[A-Za-z0-9]+)*$/i.test(part) && !/^CS/i.test(part) && !/^PO/i.test(part) && /[A-Z]/i.test(part) && /\d/.test(part)) {
            sku = part;
            continue;
        }

        // Customer Name
        if (!customer && !/^\d+$/.test(part) && part.length > 2) {
            customer = part.replace(/([a-z])([A-Z])/g, "$1 $2").trim();
        }
    }

    return { source, material, orderNo, sku, customer };
}

export function parseReturnFormText(text: string, fileName: string = ""): ParsedReturnForm {
    const cleanText = (text || "").replace(/\r/g, "");
    const lines = cleanText.split("\n").map(l => l.trim()).filter(Boolean);

    let sku: string | null = null;
    let dimensions: string | null = null;
    let material: string | null = null;
    let orderNo: string | null = null;
    let returnReason: string | null = null;
    let source = "Bilinmiyor";

    const isGarbage = (s: string) => {
        if (!s) return true;
        const lower = s.toLowerCase();
        if (s.startsWith("--") || s.endsWith("--")) return true;
        if (/^\d+\s*of\s*\d+$/i.test(s)) return true;
        if (lower === "product image" || lower === "return form") return true;
        return false;
    };

    const isLabel = (s: string) => {
        const lower = s.toLowerCase();
        return lower === "dimensions" || lower === "reason for return" ||
               lower === "paper type" || lower === "order no" || lower === "sku" ||
               lower === "ürün kodu" || lower === "ölçü" || lower === "kağıt türü" ||
               lower === "product image" || lower === "return form";
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 1. Dimensions / Ölçü
        if (/^(?:Dimensions|Ölçü|Size|Boyut)(?:\s*:|$)/i.test(line)) {
            if (line.includes(":")) {
                const val = line.split(":")[1]?.trim();
                if (val && !isGarbage(val)) dimensions = val;
            } else if (i + 1 < lines.length && !isLabel(lines[i + 1]) && !isGarbage(lines[i + 1])) {
                dimensions = lines[i + 1];
            } else if (i > 0 && !isLabel(lines[i - 1]) && !isGarbage(lines[i - 1]) && /\d+.*(?:w|h|x|cm|inch|\"|\'\')/i.test(lines[i - 1])) {
                dimensions = lines[i - 1];
            }
        }

        // 2. Reason for Return / İade Nedeni
        if (/^(?:Reason\s*for\s*Return|İade\s*Nedeni)(?:\s*:|$)/i.test(line)) {
            if (line.includes(":")) {
                const val = line.split(":")[1]?.trim();
                if (val && !isGarbage(val)) returnReason = val;
            } else if (i + 1 < lines.length && !isLabel(lines[i + 1]) && !isGarbage(lines[i + 1])) {
                returnReason = lines[i + 1];
            }
        }

        // 3. Paper Type / Kağıt Türü / Doku / Material
        if (/^(?:Paper\s*Type|Kağıt\s*Türü|Doku|Material|Materyal)(?:\s*:|$)/i.test(line)) {
            if (line.includes(":")) {
                const val = line.split(":")[1]?.trim();
                if (val && !isGarbage(val)) material = val;
            } else {
                // In inverted format: value is the line BEFORE ("Non Woven \n Paper Type")
                if (i > 0 && !isLabel(lines[i - 1]) && !isGarbage(lines[i - 1])) {
                    material = lines[i - 1];
                } else if (i + 1 < lines.length && !isLabel(lines[i + 1]) && !isGarbage(lines[i + 1])) {
                    material = lines[i + 1];
                }
            }
        }

        // 4. Order No / Sipariş No
        if (/^(?:Order\s*No|Sipariş\s*No|PO\s*Number)(?:\s*:|$)/i.test(line)) {
            if (line.includes(":")) {
                const val = line.split(":")[1]?.trim();
                if (val && !isGarbage(val)) orderNo = val;
            } else {
                // In inverted format: value is line BEFORE ("CS673263650 \n Order No")
                if (i > 0 && !isLabel(lines[i - 1]) && !isGarbage(lines[i - 1])) {
                    orderNo = lines[i - 1];
                } else if (i + 1 < lines.length && !isLabel(lines[i + 1]) && !isGarbage(lines[i + 1])) {
                    orderNo = lines[i + 1];
                }
            }
        }

        // 5. SKU / Ürün Kodu
        if (/^(?:SKU|Ürün\s*Kodu|Product\s*Code|Part\s*Number)(?:\s*:|$)/i.test(line)) {
            if (line.includes(":")) {
                const val = line.split(":")[1]?.trim();
                if (val && !isGarbage(val)) sku = val;
            } else {
                // In inverted format: value is line BEFORE ("YZ1034 \n SKU")
                if (i > 0 && !isLabel(lines[i - 1]) && !isGarbage(lines[i - 1])) {
                    sku = lines[i - 1];
                } else if (i + 1 < lines.length && !isLabel(lines[i + 1]) && !isGarbage(lines[i + 1])) {
                    sku = lines[i + 1];
                }
            }
        }
    }

    // Structured filename parsing fallback
    const fileParsed = parseFromFileName(fileName);

    // Material fallback & normalization
    if (!material || isGarbage(material) || material.length < 2) {
        if (fileParsed.material) material = fileParsed.material;
        else if (/non\s*woven/i.test(cleanText) || /nonwoven/i.test(fileName)) material = "Non Woven";
        else if (/peel\s*(?:and|&)\s*stick/i.test(cleanText) || /canvas\-peel/i.test(cleanText) || /peelandstick/i.test(fileName)) material = "Peel & Stick";
        else if (/textured/i.test(cleanText) || /textured/i.test(fileName)) material = "Textured";
        else if (/canvas/i.test(cleanText) || /canvas/i.test(fileName)) material = "Canvas";
        else if (/vinil|vinyl/i.test(cleanText) || /vinyl/i.test(fileName)) material = "Vinyl";
    }

    // Order No fallback from fileName or text (supports 5 to 12 digits, CS..., PO...)
    if (!orderNo || isGarbage(orderNo)) {
        if (fileParsed.orderNo) {
            orderNo = fileParsed.orderNo;
        } else {
            const ordMatch = (fileName + " " + cleanText).match(/(CS\d{5,}|PO\d{5,}|(?<!\d)\d{5,12}(?!\d))/i);
            if (ordMatch) orderNo = ordMatch[1];
        }
    }

    // SKU fallback from fileName or text patterns (e.g. YZ1034, GM1234, SH1114-P)
    if (!sku || isGarbage(sku) || sku.toLowerCase() === "unknown") {
        if (fileParsed.sku) {
            sku = fileParsed.sku;
        } else {
            const skuPattern = (cleanText + " " + fileName).match(/\b([A-Z]{2,4}[-_]?\d{3,6}(?:-[A-Za-z0-9]+)?)\b/);
            if (skuPattern && !skuPattern[1].startsWith("CS") && !skuPattern[1].startsWith("PO")) {
                sku = skuPattern[1];
            }
        }
    }

    // Customer / Return Reason fallback
    if (!returnReason || isGarbage(returnReason)) {
        if (fileParsed.customer) {
            returnReason = fileParsed.customer;
        }
    }

    // Source detection (Wayfair, PrintMarkt, Woo, Etsy, Shopify)
    if (fileParsed.source) {
        source = fileParsed.source;
    } else {
        const fullHaystack = `${cleanText} ${returnReason || ""} ${fileName}`.toLowerCase();
        if (fullHaystack.includes("wayfair")) source = "Wayfair";
        else if (fullHaystack.includes("printmarkt")) source = "PrintMarkt";
        else if (fullHaystack.includes("woo") || fullHaystack.includes("woocommerce")) source = "WooCommerce";
        else if (fullHaystack.includes("etsy")) source = "Etsy";
        else if (fullHaystack.includes("shopify")) source = "Shopify";
    }

    // Clean up multiple spaces or trailing semicolons
    if (dimensions) {
        dimensions = dimensions.split(";")[0].split("|")[0].trim();
    }
    if (material) {
        material = material.split(";")[0].split("|")[0].trim();
    }

    return {
        sku: sku && !isGarbage(sku) ? (sku.toLowerCase() === "unknown" ? "Bilinmiyor" : sku) : null,
        dimensions: dimensions && !isGarbage(dimensions) ? dimensions : null,
        material: material && !isGarbage(material) ? material : null,
        orderNo: orderNo && !isGarbage(orderNo) ? orderNo : null,
        source,
        returnReason: returnReason && !isGarbage(returnReason) ? returnReason : null,
        rawText: cleanText.substring(0, 500)
    };
}

export async function parseReturnFormPdf(pdfBuffer: Buffer, fileName: string = ""): Promise<ParsedReturnForm> {
    let text = "";
    try {
        const pdfParseModule = require('pdf-parse');
        if (typeof pdfParseModule === 'function') {
            const data = await pdfParseModule(pdfBuffer);
            text = data.text || "";
        } else if (pdfParseModule.PDFParse) {
            const parser = new pdfParseModule.PDFParse({ data: pdfBuffer });
            const data = await parser.getText();
            text = (typeof data === 'string' ? data : data?.text) || "";
            if (parser.destroy) {
                try { await parser.destroy(); } catch { /* ignore */ }
            }
        } else if (typeof pdfParseModule.default === 'function') {
            const data = await pdfParseModule.default(pdfBuffer);
            text = data.text || "";
        }
    } catch (err: any) {
        console.warn(`PDF ayrıştırma uyarısı (${fileName}): ${err?.message || err}. Dosya adı fallback'i kullanılıyor.`);
        // Graceful fallback to filename parsing - never crash the upload!
    }

    return parseReturnFormText(text, fileName);
}
