export interface ParsedReturnForm {
    sku: string | null;
    dimensions: string | null;
    material: string | null;
    orderNo: string | null;
    source: string;
    returnReason: string | null;
    rawText?: string;
}

export function parseReturnFormText(text: string): ParsedReturnForm {
    const cleanText = text.replace(/\r/g, "");

    let sku: string | null = null;
    let dimensions: string | null = null;
    let material: string | null = null;
    let orderNo: string | null = null;
    let returnReason: string | null = null;

    // 1. Find SKU / Ürün Kodu
    // Cases:
    // "SKU: YZ1034" or "SKU\nYZ1034" or "YZ1034\nSKU" or "Kod: YZ1034"
    const skuAfter = cleanText.match(/(?:SKU|Ürün\s*Kodu|Product\s*Code|Part\s*Number)\s*[:\s]*\n*([A-Za-z0-9\-_]+)/i);
    const skuBefore = cleanText.match(/([A-Za-z0-9\-_]{3,})\s*\n+\s*SKU/i);
    if (skuAfter && !skuAfter[1].toLowerCase().includes("sku")) {
        sku = skuAfter[1].trim();
    } else if (skuBefore) {
        sku = skuBefore[1].trim();
    }

    // 2. Find Dimensions / Ölçü
    // Cases:
    // "Dimensions: 90" W x 60" H" or "Dimensions\n90'' W x 60'' H" or "90'' W x 60'' H\n..." or "245x245 CM"
    const dimAfter = cleanText.match(/(?:Dimensions|Ölçü|Size|Boyut)\s*[:\s]*\n*([^\n\r]+)/i);
    const dimRegex = /([0-9\.\'\"]+\s*(?:[WwXxHh\s,\*]|CM|cm|INCH|inch|\"|\'\')+[0-9\.\'\"]*(?:\s*[WwXxHh\s]*[A-Za-z]+)?)/i;
    if (dimAfter && dimAfter[1].trim().length > 1) {
        dimensions = dimAfter[1].trim();
    } else {
        const dimMatch = cleanText.match(dimRegex);
        if (dimMatch) dimensions = dimMatch[1].trim();
    }

    // 3. Find Paper Type / Kağıt Türü / Doku
    // Cases:
    // "Paper Type: Non Woven" or "Paper Type\nNon Woven" or "Non Woven\nPaper Type" or "Doku: Canvas-Peel-And-Stick"
    const matAfter = cleanText.match(/(?:Paper\s*Type|Kağıt\s*Türü|Doku|Material|Materyal)\s*[:\s]*\n*([^\n\r]+)/i);
    const matBefore = cleanText.match(/([A-Za-z\s\-]+)\s*\n+\s*Paper\s*Type/i);
    if (matAfter && matAfter[1].trim().length > 1 && !matAfter[1].toLowerCase().includes("paper")) {
        material = matAfter[1].trim();
    } else if (matBefore) {
        material = matBefore[1].trim();
    }

    // Fallback material detection by common wallpaper paper types if missing
    if (!material) {
        if (/non\s*woven/i.test(cleanText)) material = "Non Woven";
        else if (/peel\s*(?:and|&)\s*stick/i.test(cleanText) || /canvas\-peel/i.test(cleanText)) material = "Peel & Stick";
        else if (/textured/i.test(cleanText)) material = "Textured";
        else if (/canvas/i.test(cleanText)) material = "Canvas";
    }

    // 4. Find Order No / Sipariş No
    const ordAfter = cleanText.match(/(?:Order\s*No|Sipariş\s*No|PO\s*Number)\s*[:\s]*\n*([A-Za-z0-9\-_]+)/i);
    const ordBefore = cleanText.match(/([A-Za-z0-9\-_]{4,})\s*\n+\s*Order\s*No/i);
    if (ordAfter && !ordAfter[1].toLowerCase().includes("order")) {
        orderNo = ordAfter[1].trim();
    } else if (ordBefore) {
        orderNo = ordBefore[1].trim();
    }

    // 5. Find Reason for Return / İade Nedeni
    const reasonMatch = cleanText.match(/(?:Reason\s*for\s*Return|İade\s*Nedeni)\s*[:\s]*\n*([^\n\r]+)/i);
    if (reasonMatch) {
        returnReason = reasonMatch[1].trim();
    }

    // 6. Source / Platform Detection (Wayfair, PrintMarkt, Woo, Etsy, Shopify)
    let source = "Bilinmiyor";
    const combined = (cleanText + " " + (returnReason || "")).toLowerCase();
    if (combined.includes("wayfair")) source = "Wayfair";
    else if (combined.includes("printmarkt")) source = "PrintMarkt";
    else if (combined.includes("woo") || combined.includes("woocommerce")) source = "WooCommerce";
    else if (combined.includes("etsy")) source = "Etsy";
    else if (combined.includes("shopify")) source = "Shopify";

    // Clean up multiple spaces or trailing semicolons
    if (dimensions) {
        dimensions = dimensions.split(";")[0].split("|")[0].trim();
    }
    if (material) {
        material = material.split(";")[0].split("|")[0].trim();
    }

    return {
        sku,
        dimensions,
        material,
        orderNo,
        source,
        returnReason,
        rawText: cleanText.substring(0, 500)
    };
}

export async function parseReturnFormPdf(pdfBuffer: Buffer): Promise<ParsedReturnForm> {
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

    return parseReturnFormText(text);
}
