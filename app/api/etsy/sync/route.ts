import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { fetchEtsy } from "@/lib/etsy";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const shops = await db.etsyShop.findMany();
        let totalNewOrders = 0;

        for (const shop of shops) {
            // Fetch receipts (orders) from Etsy
            // limit=50, was_paid=true, was_shipped=false (to get pending orders)
            const data = await fetchEtsy(`shops/${shop.shopId}/receipts?limit=50&was_paid=true`, shop.shopId);

            if (data.results) {
                for (const receipt of data.results) {
                    const receiptId = receipt.receipt_id.toString();

                    // Idempotency: use Etsy receipt_id as unique key (externalId)
                    const existingOrder = await db.order.findUnique({
                        where: {
                            source_externalId: {
                                source: 'etsy',
                                externalId: receiptId
                            }
                        }
                    });

                    if (existingOrder) continue;

                    // Fetch Transaction details for line items
                    const transactions = await fetchEtsy(`shops/${shop.shopId}/receipts/${receiptId}/transactions`, shop.shopId);

                    // Map Etsy receipt to our Order model
                    await db.order.create({
                        data: {
                            customer: `${receipt.name}`,
                            email: receipt.buyer_email,
                            address: `${receipt.first_line}${receipt.second_line ? ' ' + receipt.second_line : ''}`,
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
                                    image_src: "", // Ideally fetch listing image here if needed
                                    material: "",
                                    dimensions: ""
                                }))
                            }
                        }
                    });

                    totalNewOrders++;
                }
            }
        }

        return NextResponse.json({ success: true, newOrders: totalNewOrders });
    } catch (err: any) {
        console.error("Etsy Sync Error:", err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
