
import { db } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import fs from "fs"
import path from "path"

const LOG_PATH = "/tmp/oms_debug.log";

function logToFile(msg: string) {
    const ts = new Date().toISOString();
    try {
        fs.appendFileSync(LOG_PATH, `[${ts}] [API_UNIFIED] ${msg}\n`);
    } catch (e) { }
}

export async function POST(request: Request) {
    logToFile("API Call Started");
    try {
        const body = await request.json();
        const { mode, orderId, status, orderData, orderIds, userName, version } = body;

        const session = await getSession();
        const user = userName || session?.user?.name || "Sistem (API)";

        logToFile(`Mode: ${mode} | User: ${user} | v: ${version}`);

        // Fetch all statuses to map status IDs to titles
        const statusesList = await db.statusColumn.findMany();
        const statusMap = new Map(statusesList.map(s => [s.id, s.title]));

        if (mode === 'single_status') {
            logToFile(`Updating #${orderId} to ${status}`);
            
            const oldOrder = await db.order.findUnique({ where: { id: Number(orderId) } });
            const oldStatusTitle = oldOrder ? (statusMap.get(oldOrder.status) || oldOrder.status) : "Bilinmeyen";
            const newStatusTitle = statusMap.get(status) || status;

            await db.orderActivity.create({
                data: { 
                    orderId: Number(orderId), 
                    author: user, 
                    action: "STATUS_CHANGE", 
                    details: `Sipariş durumu değiştirildi: '${oldStatusTitle}' -> '${newStatusTitle}'` 
                }
            });
            await db.order.update({ where: { id: Number(orderId) }, data: { status, updatedAt: new Date(), hasNotification: true } });
        }
        else if (mode === 'bulk_status') {
            logToFile(`Bulk Update [${orderIds?.join(',')}] to ${status}`);
            const newStatusTitle = statusMap.get(status) || status;
            for (const id of orderIds) {
                const oldOrder = await db.order.findUnique({ where: { id: Number(id) } });
                const oldStatusTitle = oldOrder ? (statusMap.get(oldOrder.status) || oldOrder.status) : "Bilinmeyen";

                await db.orderActivity.create({
                    data: { 
                        orderId: Number(id), 
                        author: user, 
                        action: "STATUS_CHANGE", 
                        details: `Toplu durum değişikliği: '${oldStatusTitle}' -> '${newStatusTitle}'` 
                    }
                });
                await db.order.update({ where: { id: Number(id) }, data: { status, updatedAt: new Date(), hasNotification: true } });
            }
        }
        else if (mode === 'full_update') {
            const order = orderData;
            const id = Number(order.id);
            logToFile(`Full Update #${id}`);

            const oldOrder = await db.order.findUnique({
                where: { id },
                include: { items: true }
            });

            if (oldOrder) {
                // 1. Assignee Change
                if (oldOrder.assignedTo !== order.assignedTo && order.assignedTo) {
                    await db.orderActivity.create({
                        data: { orderId: id, author: user, action: "ASSIGN_CHANGE", details: `Sorumluluk atandı: ${order.assignedTo}` }
                    });
                }

                // 2. Status Change
                if (oldOrder.status !== order.status) {
                    const oldStatusTitle = statusMap.get(oldOrder.status) || oldOrder.status;
                    const newStatusTitle = statusMap.get(order.status) || order.status;
                    await db.orderActivity.create({
                        data: { orderId: id, author: user, action: "STATUS_CHANGE", details: `Sipariş durumu değiştirildi: '${oldStatusTitle}' -> '${newStatusTitle}'` }
                    });
                }

                // 3. Customer Details Change
                const customerChanged =
                    oldOrder.customer !== order.customer ||
                    oldOrder.phone !== order.phone ||
                    oldOrder.address !== order.address ||
                    oldOrder.city !== order.city;

                if (customerChanged) {
                    await db.orderActivity.create({
                        data: { orderId: id, author: user, action: "DETAILS_UPDATE", details: "Müşteri ve teslimat bilgileri güncellendi." }
                    });
                }

                // 4. Tracking Number
                if (oldOrder.trackingNumber !== order.trackingNumber && order.trackingNumber) {
                    await db.orderActivity.create({
                        data: { orderId: id, author: user, action: "TRACKING_UPDATE", details: `Kargo takip no girildi: ${order.trackingNumber}` }
                    });
                }

                // 5. Note Added
                if (oldOrder.printNotes !== order.printNotes) {
                    await db.orderActivity.create({
                        data: { orderId: id, author: user, action: "NOTE_ADDED", details: "İşlem notu güncellendi." }
                    });
                }

                // 6. Labels Change
                const oldLabels = oldOrder.labels;
                const newLabels = typeof order.labels === 'string' ? order.labels : JSON.stringify(order.labels);
                if (oldLabels !== newLabels) {
                    await db.orderActivity.create({
                        data: { orderId: id, author: user, action: "LABEL_UPDATE", details: "Etiketler güncellendi." }
                    });
                }

                // 7. Item Updates
                if (order.items && Array.isArray(order.items)) {
                    const itemsChanged = JSON.stringify(oldOrder.items.map(i => ({ sku: i.sku, material: i.material, dimensions: i.dimensions }))) !==
                        JSON.stringify(order.items.map((i: any) => ({ sku: i.sku, material: i.material, dimensions: i.dimensions })));
                    if (itemsChanged) {
                        await db.orderActivity.create({
                            data: { orderId: id, author: user, action: "ITEM_UPDATE", details: "Ürün detayları (SKU/Doku/Ölçü) güncellendi." }
                        });
                    }
                }
            } else {
                await db.orderActivity.create({
                    data: { orderId: id, author: user, action: "DETAILS_UPDATE_API", details: `Sipariş detayları güncellendi.` }
                });
            }

            await db.order.update({
                where: { id },
                data: {
                    labels: typeof order.labels === 'string' ? order.labels : JSON.stringify(order.labels),
                    assignedTo: order.assignedTo || user,
                    status: order.status,
                    trackingNumber: order.trackingNumber,
                    printNotes: order.printNotes,
                    customer: order.customer,
                    phone: order.phone,
                    address: order.address,
                    city: order.city,
                    hasNotification: true,
                    updatedAt: new Date(),
                    items: order.items ? {
                        deleteMany: {},
                        create: order.items.map((item: any) => ({
                            name: item.name,
                            quantity: item.quantity,
                            image_src: item.image_src,
                            sku: item.sku,
                            url: item.url,
                            material: item.material,
                            dimensions: item.dimensions,
                            productNote: item.productNote,
                            sampleData: item.sampleData
                        }))
                    } : undefined
                }
            });
        }

        logToFile("SUCCESS");
        // revalidatePath("/"); // Commented out to prevent database query bottleneck and team chat lag
        return NextResponse.json({ success: true });

    } catch (e: any) {
        logToFile(`CRITICAL ERR: ${e.message}`);
        console.error("API update-order failure:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
