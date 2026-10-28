import crypto from "crypto";

const EDM_SERVICE_URL = "https://portal2.edmbilisim.com.tr/EFaturaEDM/EFaturaEDM.svc";

const DEFAULT_EDM_CONFIG = {
    username: process.env.EDM_USERNAME || "cc_51628375490",
    password: process.env.EDM_PASSWORD || "Dkm32373***",
    gbTag: process.env.EDM_GB_TAG || "urn:mail:mesutgb@edmbilisim.com",
    supplierVkn: "51628375490",
    supplierTitle: "DUVAR KAĞIDI MARKETİ - MESUT SÖĞÜTLÜ",
    supplierFirstName: "MESUT",
    supplierFamilyName: "SÖĞÜTLÜ",
    supplierTaxOffice: "KALEKAPI VERGİ DAİRESİ MÜD.",
    supplierAddress: "Meydankavağı Mah. Avni Tolunay Cad.Abdullah Yıldırım 1 Sitesi B Blok No:61/A",
    supplierDistrict: "MURATPA",
    supplierCity: "ANTALYA",
    websiteUri: "https://duvarkagidimarketi.com"
};

function escapeXml(str: string | null | undefined): string {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function numberToTurkishWords(n: number): string {
    if (n === 0) return "SIFIR";
    const ones = ["", "BİR", "İKİ", "ÜÇ", "DÖRT", "BEŞ", "ALTI", "YEDİ", "SEKİZ", "DOKUZ"];
    const tens = ["", "ON", "YİRMİ", "OTUZ", "KIRK", "ELLİ", "ALTMIŞ", "YETMİŞ", "SEKSEN", "DOKSAN"];
    const scales = ["", "BİN", "MİLYON", "MİLYAR"];

    const convertHundreds = (num: number): string => {
        let res = "";
        const h = Math.floor(num / 100);
        const rem = num % 100;
        const t = Math.floor(rem / 10);
        const o = rem % 10;
        if (h > 0) res += (h === 1 ? "" : ones[h]) + "YÜZ";
        if (t > 0) res += tens[t];
        if (o > 0) res += ones[o];
        return res;
    };

    let intPart = Math.floor(Math.abs(n));
    let scaleIdx = 0;
    let result = "";

    while (intPart > 0) {
        const chunk = intPart % 1000;
        if (chunk > 0) {
            let chunkStr = convertHundreds(chunk);
            if (scaleIdx === 1 && chunk === 1) {
                chunkStr = "BİN";
            } else {
                chunkStr += scales[scaleIdx];
            }
            result = chunkStr + result;
        }
        intPart = Math.floor(intPart / 1000);
        scaleIdx++;
    }
    return result;
}

function amountToTurkishText(amount: number): string {
    const fixed = amount.toFixed(2);
    const [liraStr, kurusStr] = fixed.split(".");
    const lira = parseInt(liraStr, 10) || 0;
    const kurus = parseInt(kurusStr, 10) || 0;

    let text = `YALNIZ #${numberToTurkishWords(lira)}TÜRKLİRASI`;
    if (kurus > 0) {
        text += `${numberToTurkishWords(kurus)}KURUŞ`;
    }
    text += "#";
    return text;
}

function parseOrderTotal(totalStr: string | number | null | undefined): number {
    if (typeof totalStr === "number") return totalStr;
    if (!totalStr) return 0;
    const cleaned = String(totalStr).replace(/[^0-9.,]/g, "").trim();
    if (!cleaned) return 0;
    if (cleaned.includes(".") && cleaned.includes(",")) {
        if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
            return parseFloat(cleaned.replace(/\./g, "").replace(",", ".")) || 0;
        } else {
            return parseFloat(cleaned.replace(/,/g, "")) || 0;
        }
    }
    if (cleaned.includes(",")) {
        return parseFloat(cleaned.replace(",", ".")) || 0;
    }
    return parseFloat(cleaned) || 0;
}

function formatIstanbulDateTime(date: Date = new Date()): { dateStr: string; timeStr: string } {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Istanbul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    }).formatToParts(date);

    const get = (type: string) => parts.find(p => p.type === type)?.value || "00";
    const year = get("year");
    const month = get("month");
    const day = get("day");
    const hour = get("hour") === "24" ? "00" : get("hour");
    const minute = get("minute");
    const second = get("second");

    return {
        dateStr: `${year}-${month}-${day}`,
        timeStr: `${hour}:${minute}:${second}`
    };
}

async function edmSoapCall(action: string, bodyXml: string): Promise<{ status: number; text: string }> {
    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
    ${bodyXml}
  </s:Body>
</s:Envelope>`;

    const res = await fetch(EDM_SERVICE_URL, {
        method: "POST",
        headers: {
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": `"${action}"`
        },
        body: envelope,
        cache: "no-store",
        signal: AbortSignal.timeout(25000)
    });
    return { status: res.status, text: await res.text() };
}

function getEdmCredentials(settings: Record<string, string | undefined> = {}) {
    const rawUser = settings.fe_user?.trim();
    const rawPass = settings.fe_pass?.trim();
    // Use custom settings if they look like EDM username (e.g. cc_...), otherwise fallback to default EDM account
    const username = rawUser && !rawUser.includes("@") ? rawUser : DEFAULT_EDM_CONFIG.username;
    const password = rawUser && !rawUser.includes("@") && rawPass ? rawPass : DEFAULT_EDM_CONFIG.password;
    const gbTag = settings.fe_app_key?.startsWith("urn:mail:") ? settings.fe_app_key.trim() : DEFAULT_EDM_CONFIG.gbTag;

    return { username, password, gbTag };
}

export async function loginToEdm(settings: Record<string, string | undefined> = {}): Promise<string> {
    const { username, password } = getEdmCredentials(settings);
    const now = new Date().toISOString();

    const res = await edmSoapCall("LoginRequest", `<LoginRequest xmlns="http://tempuri.org/">
      <REQUEST_HEADER xmlns="">
        <SESSION_ID>0</SESSION_ID>
        <CLIENT_TXN_ID>${crypto.randomUUID()}</CLIENT_TXN_ID>
        <ACTION_DATE>${now}</ACTION_DATE>
        <REASON>E-Fatura Islemleri</REASON>
        <APPLICATION_NAME>DKM_OMS</APPLICATION_NAME>
        <HOSTNAME>duvarkagidimarketi.com</HOSTNAME>
        <CHANNEL_NAME>WEB</CHANNEL_NAME>
        <COMPRESSED>N</COMPRESSED>
      </REQUEST_HEADER>
      <USER_NAME xmlns="">${escapeXml(username)}</USER_NAME>
      <PASSWORD xmlns="">${escapeXml(password)}</PASSWORD>
    </LoginRequest>`);

    const sessionId = res.text.match(/<SESSION_ID[^>]*>([^<]+)<\/SESSION_ID>/)?.[1];
    if (!sessionId) {
        const fault = res.text.match(/<faultstring[^>]*>([^<]+)<\/faultstring>/)?.[1]
            || res.text.match(/<ERROR_SHORT_DES[^>]*>([^<]+)<\/ERROR_SHORT_DES>/)?.[1]
            || "EDM oturumu açılamadı.";
        throw new Error(fault);
    }
    return sessionId;
}

export async function checkEdmGibUser(sessionId: string, taxNumber: string): Promise<{ isEFatura: boolean; alias: string; title?: string }> {
    if (!taxNumber || taxNumber === "11111111111") {
        return { isEFatura: false, alias: "" };
    }
    const now = new Date().toISOString();
    const res = await edmSoapCall("CheckUserRequest", `<CheckUserRequest xmlns="http://tempuri.org/">
      <REQUEST_HEADER xmlns="">
        <SESSION_ID>${sessionId}</SESSION_ID>
        <CLIENT_TXN_ID>${crypto.randomUUID()}</CLIENT_TXN_ID>
        <ACTION_DATE>${now}</ACTION_DATE>
        <REASON>Mukellef Sorgulama</REASON>
        <APPLICATION_NAME>DKM_OMS</APPLICATION_NAME>
        <HOSTNAME>duvarkagidimarketi.com</HOSTNAME>
        <CHANNEL_NAME>WEB</CHANNEL_NAME>
        <COMPRESSED>N</COMPRESSED>
      </REQUEST_HEADER>
      <USER xmlns="">
        <IDENTIFIER>${escapeXml(taxNumber)}</IDENTIFIER>
      </USER>
    </CheckUserRequest>`);

    const userBlocks = [...res.text.matchAll(/<USER[^>]*>([\s\S]*?)<\/USER>/g)].map(m => m[1]);
    for (const block of userBlocks) {
        const unit = block.match(/<UNIT[^>]*>([^<]+)<\/UNIT>/)?.[1];
        const alias = block.match(/<ALIAS[^>]*>([^<]+)<\/ALIAS>/)?.[1];
        const title = block.match(/<TITLE[^>]*>([^<]+)<\/TITLE>/)?.[1];
        if (unit === "PK" && alias) {
            return { isEFatura: true, alias, title };
        }
    }
    const firstAlias = res.text.match(/<ALIAS[^>]*>([^<]+)<\/ALIAS>/)?.[1];
    if (firstAlias) {
        return { isEFatura: true, alias: firstAlias };
    }
    return { isEFatura: false, alias: "" };
}

export async function fetchEdmInvoicePdfBuffer(
    identifier: { id?: string; uuid?: string },
    settings: Record<string, string | undefined> = {}
): Promise<Buffer | null> {
    const sessionId = await loginToEdm(settings);
    const now = new Date().toISOString();

    const searchFields = identifier.uuid
        ? `<UUID>${escapeXml(identifier.uuid)}</UUID>`
        : `<ID>${escapeXml(identifier.id)}</ID>`;

    const res = await edmSoapCall("GetInvoiceRequest", `<GetInvoiceRequest xmlns="http://tempuri.org/">
      <REQUEST_HEADER xmlns="">
        <SESSION_ID>${sessionId}</SESSION_ID>
        <CLIENT_TXN_ID>${crypto.randomUUID()}</CLIENT_TXN_ID>
        <ACTION_DATE>${now}</ACTION_DATE>
        <REASON>Fatura PDF Indirme</REASON>
        <APPLICATION_NAME>DKM_OMS</APPLICATION_NAME>
        <HOSTNAME>duvarkagidimarketi.com</HOSTNAME>
        <CHANNEL_NAME>WEB</CHANNEL_NAME>
        <COMPRESSED>N</COMPRESSED>
      </REQUEST_HEADER>
      <INVOICE_SEARCH_KEY xmlns="">
        <LIMIT>1</LIMIT>
        ${searchFields}
        <DIRECTION>OUT</DIRECTION>
      </INVOICE_SEARCH_KEY>
      <HEADER_ONLY xmlns="">N</HEADER_ONLY>
      <INVOICE_CONTENT_TYPE xmlns="">PDF</INVOICE_CONTENT_TYPE>
    </GetInvoiceRequest>`);

    const contentBase64 = res.text.match(/<CONTENT[^>]*>([^<]+)<\/CONTENT>/)?.[1];
    if (!contentBase64) return null;
    return Buffer.from(contentBase64, "base64");
}

export async function createEdmInvoiceDirect(
    order: any,
    items: any[],
    settings: Record<string, string | undefined> = {}
) {
    try {
        const sessionId = await loginToEdm(settings);
        const { gbTag } = getEdmCredentials(settings);

        // 1. Parse Customer Tax & Name
        const rawTaxNumber = String(order.taxNumber || "11111111111").replace(/[^0-9]/g, "");
        const taxNumber = rawTaxNumber.length === 10 || rawTaxNumber.length === 11 ? rawTaxNumber : "11111111111";
        const isCompany = taxNumber.length === 10;
        const taxOffice = order.taxOffice ? String(order.taxOffice).trim() : "";

        const rawCustomer = (order.customer || "Müşteri").replace(/\n/g, " ").trim();
        const nameParts = rawCustomer.split(/\s+/);
        const surname = nameParts.length > 1 ? nameParts.pop()! : "Müşteri";
        const firstName = nameParts.join(" ") || "Müşteri";

        // 2. Parse City / District
        let il = "İSTANBUL";
        let ilce = "Merkez";
        if (order.city && order.city.includes("/")) {
            const parts = order.city.split("/");
            il = parts[parts.length - 1].trim() || "İSTANBUL";
            ilce = parts[0].trim() || "Merkez";
        } else if (order.city) {
            il = order.city.trim();
            ilce = order.district || order.city.trim();
        }
        if ((ilce === "Merkez" || ilce === "Bilinmiyor") && order.address) {
            const addressMatch = order.address.match(/([a-zA-ZçğıöşüÇĞİÖŞÜ\s]+)\s*\/\s*([a-zA-ZçğıöşüÇĞİÖŞÜ\s]+)$/);
            if (addressMatch) {
                ilce = addressMatch[1].trim();
                il = addressMatch[2].trim();
            }
        }

        // 3. Check if receiver is e-Fatura taxpayer on GİB via EDM CheckUser
        const gibUser = await checkEdmGibUser(sessionId, taxNumber);
        const isEArchive = !gibUser.isEFatura;
        const profileId = isEArchive ? "EARSIVFATURA" : "TICARIFATURA";
        const serialPrefix = isEArchive ? "PPR" : "MS0";

        // 4. Build Line Items (check WooCommerce for exact line breakdown if WooCommerce order)
        interface ComputedLine {
            name: string;
            quantity: number;
            unitPriceExclTax: number; // Before discount
            lineExtensionAmount: number; // After discount, excl tax
            discountAmount: number;
            taxRate: number;
            taxAmount: number;
        }

        const computedLines: ComputedLine[] = [];

        if (order.source === "woo" && order.externalId && settings.wc_url && settings.wc_key && settings.wc_secret) {
            try {
                const wcAuth = Buffer.from(`${settings.wc_key}:${settings.wc_secret}`).toString("base64");
                const baseUrl = settings.wc_url.replace(/\/$/, "");
                const wcRes = await fetch(`${baseUrl}/wp-json/wc/v3/orders/${order.externalId}`, {
                    headers: { Authorization: `Basic ${wcAuth}` },
                    signal: AbortSignal.timeout(8000)
                });
                if (wcRes.ok) {
                    const wcOrder = await wcRes.json();
                    if (Array.isArray(wcOrder.line_items) && wcOrder.line_items.length > 0) {
                        for (const li of wcOrder.line_items) {
                            const qty = Number(li.quantity) || 1;
                            const subtotalExcl = Number((parseFloat(li.subtotal) || 0).toFixed(2));
                            const totalExcl = Number((parseFloat(li.total) || 0).toFixed(2));
                            const discount = Math.max(0, Number((subtotalExcl - totalExcl).toFixed(2)));
                            const unitPrice = Number((subtotalExcl / qty).toFixed(2));
                            const taxAmt = Number((totalExcl * 0.20).toFixed(2));

                            computedLines.push({
                                name: li.name || "Duvar Kağıdı",
                                quantity: qty,
                                unitPriceExclTax: unitPrice,
                                lineExtensionAmount: totalExcl,
                                discountAmount: discount,
                                taxRate: 20,
                                taxAmount: taxAmt
                            });
                        }
                        const shippingTotal = Number((parseFloat(wcOrder.shipping_total) || 0).toFixed(2));
                        if (shippingTotal > 0) {
                            computedLines.push({
                                name: "Kargo",
                                quantity: 1,
                                unitPriceExclTax: shippingTotal,
                                lineExtensionAmount: shippingTotal,
                                discountAmount: 0,
                                taxRate: 20,
                                taxAmount: Number((shippingTotal * 0.20).toFixed(2))
                            });
                        }
                    }
                }
            } catch (e) {
                console.warn("[EDM_DIRECT] WooCommerce fetch fallback:", e);
            }
        }

        if (computedLines.length === 0) {
            const grandTotalInclTax = parseOrderTotal(order.total);
            const safeItems = Array.isArray(items) && items.length > 0
                ? items
                : [{ name: "Duvar Kağıdı", quantity: 1 }];
            const totalQty = safeItems.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0) || 1;
            const unitPriceIncl = grandTotalInclTax > 0 ? grandTotalInclTax / totalQty : 120;
            const unitPriceExcl = Number((unitPriceIncl / 1.2).toFixed(2));

            for (const item of safeItems) {
                const qty = Number(item.quantity) || 1;
                const lineExt = Number((unitPriceExcl * qty).toFixed(2));
                const taxAmt = Number((lineExt * 0.20).toFixed(2));
                computedLines.push({
                    name: item.name || "Duvar Kağıdı",
                    quantity: qty,
                    unitPriceExclTax: unitPriceExcl,
                    lineExtensionAmount: lineExt,
                    discountAmount: 0,
                    taxRate: 20,
                    taxAmount: taxAmt
                });
            }
        }

        const totalLineExtension = Number(computedLines.reduce((s, l) => s + l.lineExtensionAmount, 0).toFixed(2));
        const totalAllowance = Number(computedLines.reduce((s, l) => s + l.discountAmount, 0).toFixed(2));
        const totalTax = Number((totalLineExtension * 0.20).toFixed(2));
        const totalTaxInclusive = Number((totalLineExtension + totalTax).toFixed(2));

        // 5. Dates & Payment Info
        const nowIstanbul = formatIstanbulDateTime(new Date());
        const orderDateObj = order.date ? new Date(order.date) : new Date();
        const orderIstanbul = formatIstanbulDateTime(isNaN(orderDateObj.getTime()) ? new Date() : orderDateObj);

        const invoiceUuid = crypto.randomUUID();
        const xsltDocUuid = crypto.randomUUID();

        // Fetch serial XSLT from EDM so the PDF renders with the company's official template & logo
        let xsltBase64 = "";
        try {
            const xsltRes = await edmSoapCall("GetSerialXsltRequest", `<GetSerialXsltRequest xmlns="http://tempuri.org/">
              <REQUEST_HEADER xmlns="">
                <SESSION_ID>${sessionId}</SESSION_ID>
                <CLIENT_TXN_ID>${crypto.randomUUID()}</CLIENT_TXN_ID>
                <ACTION_DATE>${new Date().toISOString()}</ACTION_DATE>
                <REASON>XSLT Sorgulama</REASON>
                <APPLICATION_NAME>DKM_OMS</APPLICATION_NAME>
                <HOSTNAME>duvarkagidimarketi.com</HOSTNAME>
                <CHANNEL_NAME>WEB</CHANNEL_NAME>
                <COMPRESSED>N</COMPRESSED>
              </REQUEST_HEADER>
              <SERIAL xmlns="">${serialPrefix}</SERIAL>
              <IS_EARCHIVE xmlns="">${isEArchive ? "true" : "false"}</IS_EARCHIVE>
              <IS_INTERNET_SALES xmlns="">${isEArchive ? "true" : "false"}</IS_INTERNET_SALES>
              <IS_EXPORT xmlns="">false</IS_EXPORT>
            </GetSerialXsltRequest>`);
            xsltBase64 = xsltRes.text.match(/<XSLT[^>]*>([^<]+)<\/XSLT>/)?.[1] || "";
        } catch (e) {
            console.warn("[EDM_DIRECT] GetSerialXslt warning:", e);
        }

        const linesXml = computedLines.map((line, idx) => {
            const allowanceXml = line.discountAmount > 0
                ? `<cac:AllowanceCharge>
                    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
                    <cbc:AllowanceChargeReason>İskonto</cbc:AllowanceChargeReason>
                    <cbc:MultiplierFactorNumeric>${((line.discountAmount / (line.lineExtensionAmount + line.discountAmount)) || 0).toFixed(6)}</cbc:MultiplierFactorNumeric>
                    <cbc:Amount currencyID="TRY">${line.discountAmount.toFixed(2)}</cbc:Amount>
                    <cbc:BaseAmount currencyID="TRY">${(line.lineExtensionAmount + line.discountAmount).toFixed(2)}</cbc:BaseAmount>
                  </cac:AllowanceCharge>`
                : "";

            return `<cac:InvoiceLine>
                <cbc:ID>${idx + 1}</cbc:ID>
                <cbc:InvoicedQuantity unitCode="C62">${line.quantity.toFixed(1)}</cbc:InvoicedQuantity>
                <cbc:LineExtensionAmount currencyID="TRY">${line.lineExtensionAmount.toFixed(2)}</cbc:LineExtensionAmount>
                ${allowanceXml}
                <cac:TaxTotal>
                    <cbc:TaxAmount currencyID="TRY">${line.taxAmount.toFixed(2)}</cbc:TaxAmount>
                    <cac:TaxSubtotal>
                        <cbc:TaxableAmount currencyID="TRY">${line.lineExtensionAmount.toFixed(2)}</cbc:TaxableAmount>
                        <cbc:TaxAmount currencyID="TRY">${line.taxAmount.toFixed(2)}</cbc:TaxAmount>
                        <cbc:Percent>${line.taxRate}</cbc:Percent>
                        <cac:TaxCategory>
                            <cbc:Name>KDV</cbc:Name>
                            <cbc:TaxExemptionReasonCode/>
                            <cbc:TaxExemptionReason/>
                            <cac:TaxScheme>
                                <cbc:Name>KDV</cbc:Name>
                                <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
                            </cac:TaxScheme>
                        </cac:TaxCategory>
                    </cac:TaxSubtotal>
                </cac:TaxTotal>
                <cac:Item>
                    <cbc:Name>${escapeXml(line.name)}</cbc:Name>
                </cac:Item>
                <cac:Price>
                    <cbc:PriceAmount currencyID="TRY">${line.unitPriceExclTax.toFixed(2)}</cbc:PriceAmount>
                </cac:Price>
            </cac:InvoiceLine>`;
        }).join("");

        const xsltRefXml = xsltBase64
            ? `<cac:AdditionalDocumentReference>
                <cbc:ID>${xsltDocUuid}</cbc:ID>
                <cbc:IssueDate>${nowIstanbul.dateStr}</cbc:IssueDate>
                <cbc:DocumentType>XSLT</cbc:DocumentType>
                <cbc:DocumentDescription>Otomatik üretilmiştir.</cbc:DocumentDescription>
                <cac:Attachment>
                    <cbc:EmbeddedDocumentBinaryObject characterSetCode="UTF-8" encodingCode="Base64" filename="${invoiceUuid}.xslt" mimeCode="application/xml">${xsltBase64}</cbc:EmbeddedDocumentBinaryObject>
                </cac:Attachment>
               </cac:AdditionalDocumentReference>`
            : "";

        const returnNotesXml = isEArchive
            ? `<cbc:Note>İade Detayları</cbc:Note>
               <cbc:Note>İade Edenin Adı Soyadı :</cbc:Note>
               <cbc:Note>İade Edenin Adres :</cbc:Note>
               <cbc:Note>İade Edenin İmzası :</cbc:Note>
               <cbc:Note>Malın Cinsi :</cbc:Note>
               <cbc:Note>İade Miktarı :</cbc:Note>
               <cbc:Note>Birimi :</cbc:Note>
               <cbc:Note> Fiyat :</cbc:Note>
               <cbc:Note> Tutar :</cbc:Note>`
            : "";

        const customerSchemeId = isCompany ? "VKN" : "TCKN";
        const customerDisplayName = isCompany && gibUser.title ? gibUser.title : rawCustomer;

        const ublXml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
         xmlns:ext="http://www.w3.org/2000/09/xmldsig#"
         xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2 UBL-Invoice-2.1.xsd">
    <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
    <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
    <cbc:ProfileID>${profileId}</cbc:ProfileID>
    <cbc:CopyIndicator>false</cbc:CopyIndicator>
    <cbc:UUID>${invoiceUuid}</cbc:UUID>
    <cbc:IssueDate>${nowIstanbul.dateStr}</cbc:IssueDate>
    <cbc:IssueTime>${nowIstanbul.timeStr}</cbc:IssueTime>
    <cbc:InvoiceTypeCode>SATIS</cbc:InvoiceTypeCode>
    <cbc:Note>İRSALİYE YERİNE GEÇERLİDİR</cbc:Note>
    <cbc:Note>${amountToTurkishText(totalTaxInclusive)}</cbc:Note>
    ${returnNotesXml}
    <cbc:DocumentCurrencyCode>TRY</cbc:DocumentCurrencyCode>
    <cbc:TaxCurrencyCode>TRY</cbc:TaxCurrencyCode>
    <cbc:PricingCurrencyCode>TRY</cbc:PricingCurrencyCode>
    <cbc:PaymentCurrencyCode>TRY</cbc:PaymentCurrencyCode>
    <cbc:LineCountNumeric>${computedLines.length}</cbc:LineCountNumeric>
    <cac:AdditionalDocumentReference>
        <cbc:ID>ELEKTRONIK</cbc:ID>
        <cbc:IssueDate>${nowIstanbul.dateStr}</cbc:IssueDate>
        <cbc:DocumentTypeCode>EREPSENDT</cbc:DocumentTypeCode>
    </cac:AdditionalDocumentReference>
    ${xsltRefXml}
    <cac:AccountingSupplierParty>
        <cac:Party>
            <cbc:WebsiteURI>${DEFAULT_EDM_CONFIG.websiteUri}</cbc:WebsiteURI>
            <cac:PartyIdentification>
                <cbc:ID schemeID="TCKN">${DEFAULT_EDM_CONFIG.supplierVkn}</cbc:ID>
            </cac:PartyIdentification>
            <cac:PartyName>
                <cbc:Name>${escapeXml(DEFAULT_EDM_CONFIG.supplierTitle)}</cbc:Name>
            </cac:PartyName>
            <cac:PostalAddress>
                <cbc:StreetName>${escapeXml(DEFAULT_EDM_CONFIG.supplierAddress)}</cbc:StreetName>
                <cbc:CitySubdivisionName>${escapeXml(DEFAULT_EDM_CONFIG.supplierDistrict)}</cbc:CitySubdivisionName>
                <cbc:CityName>${escapeXml(DEFAULT_EDM_CONFIG.supplierCity)}</cbc:CityName>
                <cac:Country>
                    <cbc:IdentificationCode>TR</cbc:IdentificationCode>
                    <cbc:Name>Türkiye</cbc:Name>
                </cac:Country>
            </cac:PostalAddress>
            <cac:PartyTaxScheme>
                <cbc:CompanyID>${DEFAULT_EDM_CONFIG.supplierVkn}</cbc:CompanyID>
                <cac:TaxScheme>
                    <cbc:Name>${escapeXml(DEFAULT_EDM_CONFIG.supplierTaxOffice)}</cbc:Name>
                </cac:TaxScheme>
            </cac:PartyTaxScheme>
            <cac:Contact>
                <cbc:Name>${escapeXml(DEFAULT_EDM_CONFIG.supplierFirstName + " " + DEFAULT_EDM_CONFIG.supplierFamilyName)}</cbc:Name>
                <cbc:Telephone/>
            </cac:Contact>
            <cac:Person>
                <cbc:FirstName>${escapeXml(DEFAULT_EDM_CONFIG.supplierFirstName)}</cbc:FirstName>
                <cbc:FamilyName>${escapeXml(DEFAULT_EDM_CONFIG.supplierFamilyName)}</cbc:FamilyName>
            </cac:Person>
        </cac:Party>
    </cac:AccountingSupplierParty>
    <cac:AccountingCustomerParty>
        <cac:Party>
            <cac:PartyIdentification>
                <cbc:ID schemeID="${customerSchemeId}">${escapeXml(taxNumber)}</cbc:ID>
            </cac:PartyIdentification>
            <cac:PartyName>
                <cbc:Name>${escapeXml(customerDisplayName)}</cbc:Name>
            </cac:PartyName>
            <cac:PostalAddress>
                <cbc:StreetName>${escapeXml(order.address || "Adres Bilinmiyor")}</cbc:StreetName>
                <cbc:CitySubdivisionName>${escapeXml(ilce)}</cbc:CitySubdivisionName>
                <cbc:CityName>${escapeXml(il)}</cbc:CityName>
                <cac:Country>
                    <cbc:Name>Türkiye</cbc:Name>
                </cac:Country>
            </cac:PostalAddress>
            <cac:PartyTaxScheme>
                <cbc:CompanyID>${escapeXml(taxNumber)}</cbc:CompanyID>
                <cac:TaxScheme>
                    <cbc:Name>${escapeXml(taxOffice)}</cbc:Name>
                </cac:TaxScheme>
            </cac:PartyTaxScheme>
            <cac:Contact>
                <cbc:Name>${escapeXml(customerDisplayName)}</cbc:Name>
                <cbc:Telephone>${escapeXml(order.phone || "")}</cbc:Telephone>
                ${order.email ? `<cbc:ElectronicMail>${escapeXml(order.email)}</cbc:ElectronicMail>` : ""}
            </cac:Contact>
            ${!isCompany ? `<cac:Person>
                <cbc:FirstName>${escapeXml(firstName)}</cbc:FirstName>
                <cbc:FamilyName>${escapeXml(surname)}</cbc:FamilyName>
            </cac:Person>` : ""}
        </cac:Party>
    </cac:AccountingCustomerParty>
    <cac:Delivery>
        <cac:CarrierParty>
            <cac:PartyIdentification>
                <cbc:ID schemeID="VKN">6230098998</cbc:ID>
            </cac:PartyIdentification>
            <cac:PartyName>
                <cbc:Name>DHL LOJİSTİK HİZMETLERİ A.Ş.</cbc:Name>
            </cac:PartyName>
            <cac:PostalAddress>
                <cbc:StreetName>${escapeXml(order.address || "Adres Bilinmiyor")}</cbc:StreetName>
                <cbc:CitySubdivisionName>${escapeXml(ilce)}</cbc:CitySubdivisionName>
                <cbc:CityName>${escapeXml(il)}</cbc:CityName>
                <cac:Country>
                    <cbc:IdentificationCode>TR</cbc:IdentificationCode>
                    <cbc:Name>Türkiye</cbc:Name>
                </cac:Country>
            </cac:PostalAddress>
        </cac:CarrierParty>
        <cac:Despatch>
            <cbc:ActualDespatchDate>${orderIstanbul.dateStr}</cbc:ActualDespatchDate>
        </cac:Despatch>
    </cac:Delivery>
    <cac:PaymentMeans>
        <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
        <cbc:PaymentDueDate>${orderIstanbul.dateStr}</cbc:PaymentDueDate>
    </cac:PaymentMeans>
    <cac:TaxTotal>
        <cbc:TaxAmount currencyID="TRY">${totalTax.toFixed(2)}</cbc:TaxAmount>
        <cac:TaxSubtotal>
            <cbc:TaxableAmount currencyID="TRY">${totalLineExtension.toFixed(2)}</cbc:TaxableAmount>
            <cbc:TaxAmount currencyID="TRY">${totalTax.toFixed(2)}</cbc:TaxAmount>
            <cbc:Percent>20</cbc:Percent>
            <cac:TaxCategory>
                <cac:TaxScheme>
                    <cbc:Name>KDV</cbc:Name>
                    <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
                </cac:TaxScheme>
            </cac:TaxCategory>
        </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:LegalMonetaryTotal>
        <cbc:LineExtensionAmount currencyID="TRY">${totalLineExtension.toFixed(2)}</cbc:LineExtensionAmount>
        <cbc:TaxExclusiveAmount currencyID="TRY">${totalLineExtension.toFixed(2)}</cbc:TaxExclusiveAmount>
        <cbc:TaxInclusiveAmount currencyID="TRY">${totalTaxInclusive.toFixed(2)}</cbc:TaxInclusiveAmount>
        <cbc:AllowanceTotalAmount currencyID="TRY">${totalAllowance.toFixed(2)}</cbc:AllowanceTotalAmount>
        <cbc:ChargeTotalAmount currencyID="TRY">0.00</cbc:ChargeTotalAmount>
        <cbc:PayableRoundingAmount currencyID="TRY">0.00</cbc:PayableRoundingAmount>
        <cbc:PayableAmount currencyID="TRY">${totalTaxInclusive.toFixed(2)}</cbc:PayableAmount>
    </cac:LegalMonetaryTotal>
    ${linesXml}
</Invoice>`;

        const contentBase64 = Buffer.from(ublXml, "utf8").toString("base64");

        const paymentMethodRaw = (order.paymentMethod || "").toLowerCase();
        const isBankTransfer = paymentMethodRaw.includes("havale") || paymentMethodRaw.includes("eft") || paymentMethodRaw.includes("banka");
        const odemeSekli = isBankTransfer ? "EFT/HAVALE" : "KREDIKARTI/BANKAKARTI";
        const odemeAracisi = order.paymentMethod || (isBankTransfer ? "Havale / EFT" : "Kredi Banka Kartı (PayTR)");

        const internetSalesXml = isEArchive
            ? `<INTERNETSALESDETAILS>
                <webAdresi xmlns="http://tempuri.org/">https://duvarkagidimarketi.com</webAdresi>
                <odemeSekli xmlns="http://tempuri.org/">${escapeXml(odemeSekli)}</odemeSekli>
                <odemeAracisiAdi xmlns="http://tempuri.org/">${escapeXml(odemeAracisi)}</odemeAracisiAdi>
                <odemeTarihi xmlns="http://tempuri.org/">${orderIstanbul.dateStr}</odemeTarihi>
                <gonderiBilgileri xmlns="http://tempuri.org/">
                    <gonderimTarihi>${orderIstanbul.dateStr}</gonderimTarihi>
                    <gonderiTasiyan>
                        <tuzelKisi>
                            <vkn>6230098998</vkn>
                            <unvan>DHL LOJİSTİK HİZMETLERİ A.Ş.</unvan>
                        </tuzelKisi>
                    </gonderiTasiyan>
                </gonderiBilgileri>
               </INTERNETSALESDETAILS>`
            : "";

        const sendXml = `<SendInvoiceRequest xmlns="http://tempuri.org/">
          <REQUEST_HEADER xmlns="">
            <SESSION_ID>${sessionId}</SESSION_ID>
            <CLIENT_TXN_ID>${crypto.randomUUID()}</CLIENT_TXN_ID>
            <ACTION_DATE>${new Date().toISOString()}</ACTION_DATE>
            <REASON>Fatura Gonderimi</REASON>
            <APPLICATION_NAME>DKM_OMS</APPLICATION_NAME>
            <HOSTNAME>duvarkagidimarketi.com</HOSTNAME>
            <CHANNEL_NAME>WEB</CHANNEL_NAME>
            <COMPRESSED>N</COMPRESSED>
          </REQUEST_HEADER>
          <SENDER vkn="${DEFAULT_EDM_CONFIG.supplierVkn}" alias="${escapeXml(gbTag)}" xmlns=""/>
          <RECEIVER vkn="${escapeXml(taxNumber)}" alias="${escapeXml(gibUser.alias)}" xmlns=""/>
          <INVOICE TRXID="0" UUID="${invoiceUuid}" xmlns="">
            <HEADER>
              <SENDER>${DEFAULT_EDM_CONFIG.supplierVkn}</SENDER>
              <RECEIVER>${escapeXml(taxNumber)}</RECEIVER>
              <SUPPLIER>${escapeXml(DEFAULT_EDM_CONFIG.supplierTitle)}</SUPPLIER>
              <CUSTOMER>${escapeXml(customerDisplayName)}</CUSTOMER>
              <ISSUE_DATE>${nowIstanbul.dateStr}</ISSUE_DATE>
              <PAYABLE_AMOUNT currencyID="TRY">${totalTaxInclusive.toFixed(2)}</PAYABLE_AMOUNT>
              <FROM>${escapeXml(gbTag)}</FROM>
              <TO>${escapeXml(gibUser.alias)}</TO>
              <PROFILEID>${profileId}</PROFILEID>
              <INTERNETSALES>${isEArchive ? "true" : "false"}</INTERNETSALES>
              <EARCHIVE>${isEArchive ? "true" : "false"}</EARCHIVE>
              ${internetSalesXml}
              <INVOICESERIAL_REQUESTED>${serialPrefix}</INVOICESERIAL_REQUESTED>
              <INVOICE_SEND_TYPE>ELEKTRONIK</INVOICE_SEND_TYPE>
              <EARCHIVE_REPORT_SENDDATE>0001-01-01</EARCHIVE_REPORT_SENDDATE>
              <CANCEL_EARCHIVE_REPORT_SENDDATE>0001-01-01</CANCEL_EARCHIVE_REPORT_SENDDATE>
              <ERP_REFERENCE>${escapeXml(String(order.externalId || order.id))}</ERP_REFERENCE>
              <OTHER_ENTEGRATION>0</OTHER_ENTEGRATION>
            </HEADER>
            <CONTENT>${contentBase64}</CONTENT>
          </INVOICE>
        </SendInvoiceRequest>`;

        const sendRes = await edmSoapCall("SendInvoiceRequest", sendXml);

        if (sendRes.status !== 200 || sendRes.text.includes("<s:Fault>") || sendRes.text.includes("<Fault>")) {
            console.error("[EDM_DIRECT] SendInvoice Fault:", sendRes.text);
            const faultMsg = sendRes.text.match(/<ERROR_LONG_DES[^>]*>([^<]+)<\/ERROR_LONG_DES>/)?.[1]
                || sendRes.text.match(/<ERROR_SHORT_DES[^>]*>([^<]+)<\/ERROR_SHORT_DES>/)?.[1]
                || sendRes.text.match(/<faultstring[^>]*>([^<]+)<\/faultstring>/)?.[1]
                || "EDM Fatura Gönderim Hatası";
            return { error: `EDM Hatası: ${faultMsg}` };
        }

        const assignedId = sendRes.text.match(/ID="([^"]+)"/)?.[1] || null;
        const assignedUuid = sendRes.text.match(/UUID="([^"]+)"/)?.[1] || invoiceUuid;

        const pdfRouteUrl = `/api/invoice-pdf/${order.id}?edmUuid=${encodeURIComponent(assignedUuid)}${assignedId ? `&edmId=${encodeURIComponent(assignedId)}` : ""}`;

        return {
            success: true,
            invoiceId: assignedId || assignedUuid,
            serialNumber: assignedId,
            uuid: assignedUuid,
            pdfUrl: pdfRouteUrl
        };
    } catch (e: any) {
        console.error("[EDM_DIRECT] Error:", e);
        return { error: `EDM Bağlantı Hatası: ${e.message}` };
    }
}
