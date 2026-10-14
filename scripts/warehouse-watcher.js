#!/usr/bin/env node

/**
 * dkmtakip - Mac Depo Klasör İzleyici (Warehouse Folder Watcher)
 * 
 * Kullanım:
 * node scripts/warehouse-watcher.js "/Users/kullanici/Desktop/Iadeler"
 * veya
 * node scripts/warehouse-watcher.js "/Users/kullanici/Desktop/Iadeler" "https://dkmtakip.com"
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// PDF Parser
let pdfParse;
try {
    pdfParse = require('pdf-parse');
} catch (e) {
    console.error("Lütfen önce 'npm install pdf-parse' komutunu çalıştırın.");
    process.exit(1);
}

const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(process.cwd(), "warehouse-returns");
const serverUrl = process.argv[3] || process.env.DKM_SERVER_URL || "http://localhost:3000";

console.log("\n========================================================");
console.log("📦 dkmtakip - Depo Klasör İzleyici Başlatıldı");
console.log(`📁 İzlenen Klasör: ${targetDir}`);
console.log(`🌐 Hedef Sunucu:   ${serverUrl}`);
console.log("========================================================\n");

if (!fs.existsSync(targetDir)) {
    console.log(`Klasör bulunamadı, oluşturuluyor: ${targetDir}`);
    fs.mkdirSync(targetDir, { recursive: true });
}

function parseReturnFormText(text) {
    const cleanText = text.replace(/\r/g, "");

    let sku = null;
    const skuAfter = cleanText.match(/(?:SKU|Ürün\s*Kodu|Product\s*Code|Part\s*Number)\s*[:\s]*\n*([A-Za-z0-9\-_]+)/i);
    const skuBefore = cleanText.match(/([A-Za-z0-9\-_]{3,})\s*\n+\s*SKU/i);
    if (skuAfter && !skuAfter[1].toLowerCase().includes("sku")) sku = skuAfter[1].trim();
    else if (skuBefore) sku = skuBefore[1].trim();

    let dimensions = null;
    const dimAfter = cleanText.match(/(?:Dimensions|Ölçü|Size|Boyut)\s*[:\s]*\n*([^\n\r]+)/i);
    const dimRegex = /([0-9\.\'\"]+\s*(?:[WwXxHh\s,\*]|CM|cm|INCH|inch|\"|\'\')+[0-9\.\'\"]*(?:\s*[WwXxHh\s]*[A-Za-z]+)?)/i;
    if (dimAfter && dimAfter[1].trim().length > 1) dimensions = dimAfter[1].trim();
    else {
        const dimMatch = cleanText.match(dimRegex);
        if (dimMatch) dimensions = dimMatch[1].trim();
    }

    let material = null;
    const matAfter = cleanText.match(/(?:Paper\s*Type|Kağıt\s*Türü|Doku|Material|Materyal)\s*[:\s]*\n*([^\n\r]+)/i);
    const matBefore = cleanText.match(/([A-Za-z\s\-]+)\s*\n+\s*Paper\s*Type/i);
    if (matAfter && matAfter[1].trim().length > 1 && !matAfter[1].toLowerCase().includes("paper")) material = matAfter[1].trim();
    else if (matBefore) material = matBefore[1].trim();

    if (!material) {
        if (/non\s*woven/i.test(cleanText)) material = "Non Woven";
        else if (/peel\s*(?:and|&)\s*stick/i.test(cleanText) || /canvas\-peel/i.test(cleanText)) material = "Peel & Stick";
        else if (/textured/i.test(cleanText)) material = "Textured";
        else if (/canvas/i.test(cleanText)) material = "Canvas";
    }

    let orderNo = null;
    const ordAfter = cleanText.match(/(?:Order\s*No|Sipariş\s*No|PO\s*Number)\s*[:\s]*\n*([A-Za-z0-9\-_]+)/i);
    const ordBefore = cleanText.match(/([A-Za-z0-9\-_]{4,})\s*\n+\s*Order\s*No/i);
    if (ordAfter && !ordAfter[1].toLowerCase().includes("order")) orderNo = ordAfter[1].trim();
    else if (ordBefore) orderNo = ordBefore[1].trim();

    let returnReason = null;
    const reasonMatch = cleanText.match(/(?:Reason\s*for\s*Return|İade\s*Nedeni)\s*[:\s]*\n*([^\n\r]+)/i);
    if (reasonMatch) returnReason = reasonMatch[1].trim();

    let source = "Bilinmiyor";
    const combined = (cleanText + " " + (returnReason || "")).toLowerCase();
    if (combined.includes("wayfair")) source = "Wayfair";
    else if (combined.includes("printmarkt")) source = "PrintMarkt";
    else if (combined.includes("woo") || combined.includes("woocommerce")) source = "WooCommerce";
    else if (combined.includes("etsy")) source = "Etsy";
    else if (combined.includes("shopify")) source = "Shopify";

    return { sku, dimensions, material, orderNo, source, returnReason };
}

async function syncPdf(filePath) {
    const fileName = path.basename(filePath);
    if (!fileName.toLowerCase().endsWith(".pdf")) return;

    try {
        const buffer = fs.readFileSync(filePath);
        let text = "";
        const pdfModule = require('pdf-parse');
        if (typeof pdfModule === 'function') {
            const data = await pdfModule(buffer);
            text = data.text || "";
        } else if (pdfModule.PDFParse) {
            const parser = new pdfModule.PDFParse({ data: buffer });
            const data = await parser.getText();
            text = (typeof data === 'string' ? data : data?.text) || "";
            if (parser.destroy) {
                try { await parser.destroy(); } catch (e) {}
            }
        }
        const parsed = parseReturnFormText(text);

        if (!parsed.sku && !parsed.orderNo) {
            console.log(`⚠️  [UYARI] ${fileName} içinden SKU veya Sipariş No okunamadı.`);
            return;
        }

        const payload = JSON.stringify({
            sku: parsed.sku || "Bilinmiyor",
            dimensions: parsed.dimensions || "Bilinmiyor",
            material: parsed.material || "Bilinmiyor",
            orderNo: parsed.orderNo,
            source: parsed.source,
            returnReason: parsed.returnReason,
            pdfPath: filePath
        });

        const urlObj = new URL(`${serverUrl}/api/warehouse-stock`);
        const isHttps = urlObj.protocol === "https:";
        const client = isHttps ? https : http;

        const req = client.request(urlObj, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log(`✅ [EKLENDİ] ${fileName} -> Kod: ${parsed.sku} | Ölçü: ${parsed.dimensions} | Doku: ${parsed.material} | Kanal: ${parsed.source} (#${parsed.orderNo})`);
                } else {
                    console.error(`❌ [HATA] ${fileName}: HTTP ${res.statusCode} - ${data}`);
                }
            });
        });

        req.on("error", (err) => {
            console.error(`❌ [BAĞLANTI HATASI] ${serverUrl} sunucusuna bağlanılamadı:`, err.message);
        });

        req.write(payload);
        req.end();
    } catch (e) {
        console.error(`❌ [İŞLEME HATASI] ${fileName}:`, e.message);
    }
}

// Initial scan
const processedFiles = new Set();
fs.readdir(targetDir, (err, files) => {
    if (err) {
        console.error("Klasör okuma hatası:", err);
        return;
    }
    const pdfs = files.filter(f => f.toLowerCase().endsWith(".pdf"));
    console.log(`🔍 Klasörde ${pdfs.length} adet PDF bulundu. Taranıyor...`);
    pdfs.forEach(f => {
        processedFiles.add(f);
        syncPdf(path.join(targetDir, f));
    });
});

// Watch folder for changes
console.log(`👀 ${targetDir} klasörü izleniyor... Yeni PDF atıldığında otomatik işlenecek.\n`);
fs.watch(targetDir, (eventType, filename) => {
    if (!filename || !filename.toLowerCase().endsWith(".pdf")) return;
    const fullPath = path.join(targetDir, filename);

    if (fs.existsSync(fullPath)) {
        setTimeout(() => {
            syncPdf(fullPath);
        }, 500); // 500ms debounce
    }
});
