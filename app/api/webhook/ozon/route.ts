import { NextResponse } from 'next/server';
import { getSystemSettings, syncOzonOrders } from '@/app/actions';
import { upsertOzonPosting, fetchOzonOrders } from '@/lib/ozon';
import { db } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));

        // 1. Ozon Webhook Ping Verification
        if (body.message_type === 'TYPE_PING') {
            return NextResponse.json({
                version: 'v1.0',
                name: 'Ozon OMS Webhook',
                time: new Date().toISOString()
            });
        }

        // 2. Ozon New Posting or State Changed
        if (body.message_type === 'TYPE_NEW_POSTING' || body.message_type === 'TYPE_STATE_CHANGED') {
            // Trigger quick sync to ensure full order details and images are captured
            syncOzonOrders(true).catch(err => {
                console.error("[OZON_WEBHOOK_ASYNC_SYNC_ERR]", err);
            });

            return NextResponse.json({ result: true });
        }

        // 3. Cancelled Posting
        if (body.message_type === 'TYPE_POSTING_CANCELLED' && body.posting_number) {
            const existing = await db.order.findUnique({
                where: {
                    source_externalId: {
                        source: 'ozon',
                        externalId: body.posting_number
                    }
                }
            });

            if (existing) {
                await db.order.update({
                    where: { id: existing.id },
                    data: {
                        note: (existing.note ? existing.note + " | " : "") + "[Ozon'da İptal Edildi]"
                    }
                });
            }

            return NextResponse.json({ result: true });
        }

        return NextResponse.json({ result: true });
    } catch (error: any) {
        console.error('[OZON_WEBHOOK_ERROR]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        status: 'active',
        service: 'Ozon Webhook Endpoint'
    });
}
