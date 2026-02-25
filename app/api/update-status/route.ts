
import { db } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import fs from "fs"
import path from "path"

const LOG_PATH = path.join(process.cwd(), "oms_debug.log");

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
        const { mode, orderId, status, orderData, orderIds, version } = body;

        const session = await getSession();
        const user = session?.user?.name || "Sistem (API)";

        logToFile(`Mode: ${mode} | User: ${user} | v: ${version}`);

        if (mode === 'single_status') {
            logToFile(`Updating #${orderId} to ${status}`);
            await db.orderActivity.create({
                data: { orderId: Number(orderId), author: user, action: "STATUS_CHANGE_API", details: `Durum '${status}' olarak güncellendi (v15)` }
            });
            await db.order.update({ where: { id: Number(orderId) }, data: { status, updatedAt: new Date(), hasNotification: true } });
        }
        else if (mode === 'bulk_status') {
            logToFile(`Bulk Update [${orderIds?.join(',')}] to ${status}`);
            for (const id of orderIds) {
                await db.orderActivity.create({
                    data: { orderId: Number(id), author: user, action: "BULK_MOVE_API", details: `Toplu taşıma ile '${status}' yapıldı (v15)` }
                });
                await db.order.update({ where: { id: Number(id) }, data: { status, updatedAt: new Date(), hasNotification: true } });
            }
        }
        else if (mode === 'full_update') {
            const order = orderData;
            const id = Number(order.id);
            logToFile(`Full Update #${id}`);

            // Log changes logic (simplified from actions.ts)
            await db.orderActivity.create({
                data: { orderId: id, author: user, action: "DETAILS_UPDATE_API", details: `Sipariş detayları API üzerinden güncellendi (v15)` }
            });

            await db.order.update({
                where: { id },
                data: {
                    labels: typeof order.labels === 'string' ? order.labels : JSON.stringify(order.labels),
                    assignedTo: user,
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
        revalidatePath("/");
        return NextResponse.json({ success: true });

    } catch (e: any) {
        logToFile(`CRITICAL ERR: ${e.message}`);
        console.error("API update-order failure:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
