import { db } from "@/lib/prisma"
import { getSession } from "@/lib/auth"
import * as fs from "fs"

const DEBUG_LOG_PATH = "/tmp/oms_debug.log";

function serverLog(msg: string) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${msg}\n`;
    try {
        fs.appendFileSync(DEBUG_LOG_PATH, line);
        console.log(line.trim());
    } catch (e) { }
}

export async function executeCreateManualOrder(orderData: any, authorName?: string) {
    const { items, customer, phone, email, address, city, note, status, clientBarcode, total, taxNumber, taxOffice, needsInvoice, isSample } = orderData

    // Use a manual barcode prefix or the client-generated one for perfect optimistic UI sync
    const barcode = clientBarcode || (isSample ? `SAMPLE-${Date.now()}` : `MANUAL-${Date.now()}`)

    const labelsList = ['Manuel']
    if (isSample) {
        labelsList.push('Numune')
    }
    if (needsInvoice || taxNumber) {
        labelsList.push('Fatura')
    }

    try {
        const sanitizedItems = (items || []).map((item: any) => ({
            name: String(item.name || "Özel Ürün").trim(),
            sku: item.sku ? String(item.sku).trim() : null,
            quantity: Math.max(1, parseInt(String(item.quantity || 1), 10) || 1),
            image_src: item.image_src ? String(item.image_src) : "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=300",
            material: item.material ? String(item.material).trim() : null,
            dimensions: item.dimensions ? String(item.dimensions).trim() : null,
            productNote: item.productNote ? String(item.productNote).trim() : null,
            sampleData: item.sampleData ? String(item.sampleData).trim() : null,
            url: item.url ? String(item.url).trim() : null,
            croppedImage: item.croppedImage ? String(item.croppedImage).trim() : null
        }));

        serverLog(`[CREATE_MANUAL] Starting for customer: ${customer} (isSample: ${Boolean(isSample)})`);
        await db.order.create({
            data: {
                customer: String(customer || "").trim(),
                phone: phone ? String(phone).trim() : null,
                email: email ? String(email).trim() : null,
                address: address ? String(address).trim() : null,
                city: city ? String(city).trim() : null,
                note: note ? String(note).trim() : null,
                total: total ? `${total} ₺` : "0.00 ₺",
                status: status || "pending_woo",
                barcode,
                labels: JSON.stringify(labelsList),
                hasNotification: true,
                taxNumber: taxNumber ? String(taxNumber).trim() : null,
                taxOffice: taxOffice ? String(taxOffice).trim() : null,
                invoiceStatus: (needsInvoice || taxNumber) ? "pending" : "draft",
                items: {
                    create: sanitizedItems
                }
            }
        });
        serverLog(`[CREATE_MANUAL] Order created in DB.`);

        const newOrder = await db.order.findUnique({ 
            where: { barcode },
            include: { items: true }
        });
        serverLog(`[CREATE_MANUAL] Order retrieved from DB: ${newOrder?.id}`);

        if (newOrder) {
            const logText = isSample ? "Örnek (Numune) siparişi oluşturuldu." : "Manuel sipariş oluşturuldu.";
            try {
                let user = authorName;
                if (!user) {
                    const session = await getSession().catch(() => null);
                    user = session ? session.user.name : "Sistem";
                }
                await db.orderActivity.create({
                    data: {
                        orderId: newOrder.id,
                        author: user || "Sistem",
                        action: "ORDER_CREATED",
                        details: logText
                    }
                }).catch(() => {});
            } catch (logErr) {
                console.error("Activity log error:", logErr);
            }
        }

        const serializedItems = (newOrder?.items || []).map(item => {
            let serializedImageSrc = item.image_src;
            if (item.image_src?.includes('data:image')) {
                const parts = item.image_src.split('|').map((s: string) => s.trim()).filter(Boolean);
                const transformed = parts.map((part: string, idx: number) => {
                    if (part.startsWith('data:image')) {
                        return idx === 0 
                            ? `/api/order-image/${item.id}` 
                            : `/api/order-image/${item.id}?index=${idx}`;
                    }
                    return part;
                });
                serializedImageSrc = transformed.join('|');
            }
            return {
                id: item.id,
                name: item.name,
                sku: item.sku,
                quantity: item.quantity,
                image_src: serializedImageSrc,
                material: item.material,
                dimensions: item.dimensions,
                productNote: item.productNote,
                sampleData: item.sampleData,
                url: item.url,
                croppedImage: item.croppedImage,
                orderId: item.orderId
            };
        });

        const serializedOrder = newOrder ? {
            id: newOrder.id,
            barcode: newOrder.barcode,
            customer: newOrder.customer,
            phone: newOrder.phone,
            email: newOrder.email,
            address: newOrder.address,
            city: newOrder.city,
            total: newOrder.total,
            status: newOrder.status,
            date: newOrder.date.toISOString(),
            createdAt: newOrder.createdAt.toISOString(),
            updatedAt: newOrder.updatedAt.toISOString(),
            labels: labelsList,
            items: serializedItems,
            hasNotification: newOrder.hasNotification,
            taxNumber: newOrder.taxNumber,
            taxOffice: newOrder.taxOffice,
            invoiceStatus: newOrder.invoiceStatus,
            invoiceUrl: newOrder.invoiceUrl
        } : null;

        return { success: true, orderId: newOrder?.id, order: serializedOrder };

    } catch (error: any) {
        serverLog(`[CREATE_MANUAL_ERR] Failed: ${error?.message || error}`);
        console.error("Failed to create manual order:", error);
        return { success: false, error: error?.message || "Sipariş oluşturulamadı." };
    }
}

export async function executeCreateMaterialOrder(orderData: any, authorName?: string) {
    const { items, note, requestedBy, clientBarcode, customer, status, labels, total } = orderData

    const barcode = clientBarcode || `MLZ-${Date.now()}`
    const orderCustomer = customer || `📦 MALZEME SİPARİŞİ\nTalep Eden: ${requestedBy || "Atölye"}`

    try {
        serverLog(`[CREATE_MATERIAL] Starting material order: ${orderCustomer}`);

        // Ensure "Malzeme" label exists in the database
        try {
            const existingLabel = await db.orderLabel.findFirst({ where: { name: 'Malzeme' } });
            if (!existingLabel) {
                await db.orderLabel.create({
                    data: {
                        name: 'Malzeme',
                        color: 'amber'
                    }
                });
            }
        } catch (e) {
            // Non-critical, ignore
        }

        const newOrder = await db.order.create({
            data: {
                customer: orderCustomer,
                phone: "",
                email: "",
                address: "Atölye / Malzeme Deposu",
                city: "İç Tedarik",
                note: note ? note.trim() : null,
                total: total || "0.00 ₺",
                status: status || "pending_woo",
                barcode,
                source: "malzeme",
                labels: JSON.stringify(labels || ['Malzeme', 'DKM']),
                hasNotification: true,
                items: {
                    create: (items || []).map((item: any) => ({
                        name: item.name,
                        sku: item.sku || `MLZ-${Math.floor(1000 + Math.random() * 9000)}`,
                        quantity: Number(item.quantity) || 1,
                        image_src: item.image_src || "",
                        material: item.material || "Malzeme",
                        dimensions: item.dimensions || "-",
                        productNote: item.productNote || null
                    }))
                }
            }
        });

        serverLog(`[CREATE_MATERIAL] Material order created in DB: ${newOrder.id}`);

        try {
            let user = authorName || requestedBy;
            if (!user) {
                const session = await getSession().catch(() => null);
                user = session ? session.user.name : "Atölye";
            }
            await db.orderActivity.create({
                data: {
                    orderId: newOrder.id,
                    author: user || "Atölye",
                    action: "ORDER_CREATED",
                    details: `Malzeme siparişi oluşturuldu: ${(items || []).map((i: any) => `${i.name} (x${i.quantity || 1})`).join(', ')}`
                }
            }).catch(() => {});
        } catch (logErr) {
            console.error("Material order log error:", logErr);
        }

        return { success: true, orderId: newOrder.id };
    } catch (error: any) {
        serverLog(`[CREATE_MATERIAL_ERR] Failed: ${error?.message || error}`);
        console.error("Failed to create material order:", error);
        return { success: false, error: error?.message || "Malzeme siparişi oluşturulamadı." };
    }
}
