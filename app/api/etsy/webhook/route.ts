import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { fetchEtsy } from "@/lib/etsy";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        console.log("Etsy Webhook Received:", body);

        // Etsy Webhooks usually send events like 'receipt.paid'
        // Format of payload might vary, but we expect shop_id and receipt_id
        const { event, data } = body;

        if (event === 'receipt.paid') {
            const receiptId = data.receipt_id;
            const shopId = data.shop_id;

            // Fetch full details and sync
            // Re-using the logic from sync route would be ideal
            // I'll call a shared internal function if I had one, or just re-implement concisely

            // Check if exists
            const existing = await db.order.findUnique({
                where: { source_externalId: { source: 'etsy', externalId: receiptId.toString() } }
            });

            if (!existing) {
                // Fetch full receipt details
                const receipt = await fetchEtsy(`shops/${shopId}/receipts/${receiptId}`, shopId.toString());
                const transactions = await fetchEtsy(`shops/${shopId}/receipts/${receiptId}/transactions`, shopId.toString());

                await db.order.create({
                    data: {
                        customer: `${receipt.name}`,
                        email: receipt.buyer_email,
                        address: `${receipt.first_line} ${receipt.second_line || ''}`,
                        city: receipt.city,
                        total: `${receipt.total_price.amount / receipt.total_price.divisor} ${receipt.total_price.currency_code}`,
                        status: 'pending',
                        source: 'etsy',
                        externalId: receiptId,
                        date: new Date(receipt.created_timestamp * 1000),
                        labels: '["Etsy", "Yeni"]',
                        hasNotification: true,
                        items: {
                            create: transactions.results.map((t: any) => ({
                                name: t.title,
                                sku: t.sku || t.listing_id.toString(),
                                quantity: t.quantity,
                                image_src: "",
                            }))
                        }
                    }
                });
            }
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error("Etsy Webhook Processing Error:", err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
