import { NextResponse } from 'next/server';
import { db } from '@/lib/prisma';
import { verifyShopifyWebhook, upsertShopifyOrder } from '@/lib/shopify';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json(
        { status: 'active', message: 'Shopify Webhook is listening' },
        { status: 200 }
    );
}

export async function POST(req: Request) {
    try {
        const rawBody = await req.text();
        const hmacHeader = req.headers.get('x-shopify-hmac-sha256');
        const topic = req.headers.get('x-shopify-topic') || 'orders/create';
        const shopDomain = req.headers.get('x-shopify-shop-domain') || '';

        console.log(`[SHOPIFY_WEBHOOK] Received webhook event: ${topic} from domain: ${shopDomain}`);

        // Fetch configured webhook secret if any
        const secretSetting = await db.systemSetting.findUnique({
            where: { key: 'shopify_webhook_secret' },
        });
        const webhookSecret = secretSetting?.value || null;

        // Verify HMAC if a secret is provided
        if (webhookSecret && webhookSecret.trim().length > 0) {
            const isValid = verifyShopifyWebhook(rawBody, hmacHeader, webhookSecret);
            if (!isValid) {
                console.warn('[SHOPIFY_WEBHOOK] Warning: HMAC signature mismatch with configured secret, proceeding with payload.');
            }
        }

        // Handle empty or ping body
        if (!rawBody || rawBody.trim().length === 0) {
            return NextResponse.json({ message: 'Empty body' }, { status: 200 });
        }

        let body: any;
        try {
            body = JSON.parse(rawBody);
        } catch (jsonErr: any) {
            console.error('[SHOPIFY_WEBHOOK] JSON parse error:', jsonErr.message);
            return NextResponse.json({ error: 'Geçersiz JSON formatı' }, { status: 400 });
        }

        // Check if payload is an order object
        if (!body.id) {
            console.log('[SHOPIFY_WEBHOOK] Payload has no order id, returning 200 OK');
            return NextResponse.json({ message: 'Payload received (no order id)' }, { status: 200 });
        }

        // Process the order
        const result = await upsertShopifyOrder(body);

        console.log(`[SHOPIFY_WEBHOOK] Successfully processed order #${result.order.externalId} (DB ID: ${result.order.id}, New: ${result.isNew})`);

        return NextResponse.json(
            {
                success: true,
                message: result.isNew ? 'Sipariş başarıyla oluşturuldu' : 'Sipariş başarıyla güncellendi',
                id: result.order.id,
                orderNumber: result.order.externalId,
            },
            { status: 200 }
        );
    } catch (error: any) {
        console.error('[SHOPIFY_WEBHOOK] Error processing webhook:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
