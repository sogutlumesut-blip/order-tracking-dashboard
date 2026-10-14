export interface ParsedReturnForm {
    sku: string | null;
    dimensions: string | null;
    material: string | null;
    orderNo: string | null;
    source: string;
    returnReason: string | null;
    rawText?: string;
}

export function parseReturnFormText(text: string, fileName: string = ""): ParsedReturnForm {
    const cleanText = text.replace(/\r/g, "");
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

    // Material fallback & normalization
    if (!material || isGarbage(material) || material.length < 2) {
        if (/non\s*woven/i.test(cleanText) || /nonwoven/i.test(fileName)) material = "Non Woven";
        else if (/peel\s*(?:and|&)\s*stick/i.test(cleanText) || /canvas\-peel/i.test(cleanText) || /peelandstick/i.test(fileName)) material = "Peel & Stick";
        else if (/textured/i.test(cleanText) || /textured/i.test(fileName)) material = "Textured";
        else if (/canvas/i.test(cleanText) || /canvas/i.test(fileName)) material = "Canvas";
        else if (/vinil|vinyl/i.test(cleanText) || /vinyl/i.test(fileName)) material = "Vinyl";
    }

    // Order No fallback from fileName or text
    if (!orderNo || isGarbage(orderNo)) {
        const ordMatch = (fileName + " " + cleanText).match(/(CS\d{6,}|PO\d{6,}|\b\d{5,8}\b)/i);
        if (ordMatch) orderNo = ordMatch[1];
    }

    // SKU fallback from fileName or text patterns (e.g. YZ1034, GM1234, etc.)
    if (!sku || isGarbage(sku) || sku.toLowerCase() === "unknown") {
        const skuPattern = (cleanText + " " + fileName).match(/\b([A-Z]{2,4}[-_]?\d{3,6}(?:-[A-Za-z0-9]+)?)\b/);
        if (skuPattern && !skuPattern[1].startsWith("CS") && !skuPattern[1].startsWith("PO")) {
            sku = skuPattern[1];
        }
    }

    // Source detection (Wayfair, PrintMarkt, Woo, Etsy, Shopify)
    const fullHaystack = `${cleanText} ${returnReason || ""} ${fileName}`.toLowerCase();
    if (fullHaystack.includes("wayfair")) source = "Wayfair";
    else if (fullHaystack.includes("printmarkt")) source = "PrintMarkt";
    else if (fullHaystack.includes("woo") || fullHaystack.includes("woocommerce")) source = "WooCommerce";
    else if (fullHaystack.includes("etsy")) source = "Etsy";
    else if (fullHaystack.includes("shopify")) source = "Shopify";

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
        } else {
            throw new Error("Uygun PDF ayrıştırıcı bulunamadı.");
        }
    } catch (err: any) {
        console.error("PDF Parse Error:", err);
        throw new Error(`PDF okunamadı: ${err.message}`);
    }

    return parseReturnFormText(text, fileName);
}
