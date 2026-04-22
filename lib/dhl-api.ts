export async function createDHLExpressShipment(
    apiKey: string,
    apiSecret: string,
    accountNumber: string,
    order: any,
    items: any[]
) {
    const dhlUrl = "https://express.api.dhl.com/mydhlapi/shipments";

    const authHeader = "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");

    // Calculate totals
    let totalWeight = 0;
    const packages = items.map((item, index) => {
        let weight = 1;
        let length = 15;
        let width = 15;
        let height = 100;

        const volumeMatch = (item.dimensions || "").match(/(\d+)\s*[xX]\s*(\d+)/);
        if (volumeMatch) {
            const w = parseInt(volumeMatch[1]);
            const h = parseInt(volumeMatch[2]);
            const minD = Math.min(w, h);
            length = 15;
            width = 15;
            height = minD || 100;

            const desi = Math.max(1, Math.round((length * width * height) / 3000));
            weight = Math.max(1, Math.round(desi * 0.8));
        }

        const itemQty = item.quantity || 1;
        totalWeight += weight * itemQty;

        return {
            weight: weight,
            dimensions: {
                length,
                width,
                height
            },
            customerReferences: [
                {
                    value: `ITEM-${item.id}`,
                    typeCode: "CU"
                }
            ]
        };
    });

    if (totalWeight < 1) totalWeight = 1;

    // DHL Requires an origin address. We use a placeholder here assuming shipping from Turkey.
    // The user should update these to their real origin details.
    const shipperDetails = {
        postalAddress: {
            postalCode: "34000",
            cityName: "Istanbul",
            countryCode: "TR",
            addressLine1: "Gonderici Adresi (Lutfen Guncelleyin)"
        },
        contactInformation: {
            email: "info@duvarkagidimarketi.com",
            phone: "05550000000",
            companyName: "Duvar Kagidi Marketi",
            fullName: "Yetkili Kisi"
        }
    };

    // Attempt to parse receiver city and country. Default to TR if unknown, but usually DHL is for international.
    // DHL MyDHL API STRICTLY requires countryCode. We will assume "TR" if we can't detect it, or user can put it in address.
    // Let's do a simple fallback mechanism.
    let receiverCountryCode = "TR"; // Default
    const addrUpper = (order.address || "").toUpperCase();
    if (addrUpper.includes("GERMANY") || addrUpper.includes("DEUTSCHLAND")) receiverCountryCode = "DE";
    else if (addrUpper.includes("UNITED STATES") || addrUpper.includes("USA")) receiverCountryCode = "US";
    else if (addrUpper.includes("UNITED KINGDOM") || addrUpper.includes("UK")) receiverCountryCode = "GB";
    else if (addrUpper.includes("FRANCE")) receiverCountryCode = "FR";
    else if (addrUpper.includes("NETHERLANDS")) receiverCountryCode = "NL";

    // Create tomorrow's date for plannedShippingDateAndTime
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const plannedDate = tomorrow.toISOString().split('.')[0] + "GMT+03:00"; // Turkey Time

    const payload = {
        plannedShippingDateAndTime: plannedDate,
        pickup: {
            isRequested: false
        },
        productCode: "P", // P = Worldwide Express, N = Domestic
        accounts: [
            {
                typeCode: "shipper",
                number: accountNumber
            }
        ],
        customerDetails: {
            shipperDetails,
            receiverDetails: {
                postalAddress: {
                    postalCode: "00000", // Placeholder, DHL requires valid postal code for most countries
                    cityName: (order.city || "Bilinmiyor").substring(0, 45),
                    countryCode: receiverCountryCode,
                    addressLine1: (order.address || "Adres Bilinmiyor").substring(0, 45)
                },
                contactInformation: {
                    email: order.email || "no-email@example.com",
                    phone: (order.phone || "0000000000").replace(/[^0-9+]/g, ''),
                    companyName: (order.customer || "Musteri").substring(0, 45),
                    fullName: (order.customer || "Musteri").substring(0, 45)
                }
            }
        },
        content: {
            packages,
            isCustomsDeclarable: true,
            description: "Duvarkagidi / Wallpaper",
            incoterm: "DAP",
            unitOfMeasurement: "metric"
        }
    };

    try {
        const response = await fetch(dhlUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": authHeader
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("DHL API Error:", JSON.stringify(data, null, 2));
            const errorMessage = data.detail || (data.title || "DHL API Hatası.");
            return { error: `DHL Hatası: ${errorMessage}` };
        }

        // Successfully created. Extract the label (Base64 PDF) and tracking number.
        const trackingNumber = data.shipmentTrackingNumber;
        const documents = data.documents || [];
        const labelDoc = documents.find((doc: any) => doc.typeCode === "label" || doc.imageFormat === "PDF");
        
        if (!labelDoc || !labelDoc.content) {
            return { error: "DHL başarıyla kayıt açtı ancak PDF etiketi dönemedi." };
        }

        return {
            success: true,
            trackingNumber: trackingNumber,
            labelPdfBase64: labelDoc.content
        };
    } catch (e: any) {
        console.error("DHL Network Error:", e);
        return { error: `DHL Bağlantı Hatası: ${e.message}` };
    }
}
