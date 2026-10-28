import { NextResponse } from 'next/server';
import { db } from '@/lib/prisma';
import { verifyShopifyWebhook, upsertShopifyOrder, cleanShopifyDomain, ShopifyStoreConfig } from '@/lib/shopify';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json(
        { status: 'active', message: 'Shopify Webhook is listening (Multi-Store Supported)' },
        { status: 200 }
    );
}

export async function POST(req: Request) {
    try {
        const rawBody = await req.text();
        const hmacHeader = req.headers.get('x-shopify-hmac-sha256');
        const topic = req.headers.get('x-shopify-topic') || 'orders/create';
        const shopDomain = cleanShopifyDomain(req.headers.get('x-shopify-shop-domain') || '');

        const { searchParams } = new URL(req.url);
        const storeParam = searchParams.get('store');

        console.log(`[SHOPIFY_WEBHOOK] Received webhook event: ${topic} from domain: ${shopDomain || 'unknown'} (store param: ${storeParam || 'auto'})`);

        // Fetch settings for Store 1 and Store 2
        const settings = await db.systemSetting.findMany({
            where: {
                key: {
                    in: [
                        'shopify_shop_domain',
                        'shopify_webhook_secret',
                        'shopify_shop_name',
                        'shopify_shop_domain_2',
                        'shopify_webhook_secret_2',
                        'shopify_shop_name_2',
                    ],
                },
            },
        });

        const settingsMap = settings.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {} as Record<string, string>);

        const domain1 = cleanShopifyDomain(settingsMap.shopify_shop_domain || '');
        const secret1 = settingsMap.shopify_webhook_secret || null;
        const name1 = settingsMap.shopify_shop_name || 'Shopify';

        const domain2 = cleanShopifyDomain(settingsMap.shopify_shop_domain_2 || '');
        const secret2 = settingsMap.shopify_webhook_secret_2 || null;
        const name2 = settingsMap.shopify_shop_name_2 || 'Shopify 2';

        // Detect if this request belongs to Store 2
        const isStore2 = Boolean(
            storeParam === '2' ||
            (domain2 && shopDomain && shopDomain.toLowerCase() === domain2.toLowerCase())
        );

        const storeConfig: ShopifyStoreConfig = isStore2
            ? {
                  storeId: '2',
                  storeName: name2,
                  source: 'shopify_2',
                  barcodePrefix: 'SHOP2-',
                  shopDomain: domain2 || shopDomain,
              }
            : {
                  storeId: '1',
                  storeName: name1,
                  source: 'shopify',
                  barcodePrefix: 'SHOP-',
                  shopDomain: domain1 || shopDomain,
              };

        const webhookSecret = isStore2 ? secret2 : secret1;

        // Verify HMAC if a secret is provided
        if (webhookSecret && webhookSecret.trim().length > 0) {
            const isValid = verifyShopifyWebhook(rawBody, hmacHeader, webhookSecret);
            if (!isValid) {
                console.warn(`[SHOPIFY_WEBHOOK] Warning: HMAC signature mismatch for ${storeConfig.storeName}, proceeding with payload.`);
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

        // Process the order with store configuration
        const result = await upsertShopifyOrder(body, storeConfig);

        console.log(`[SHOPIFY_WEBHOOK] Successfully processed order #${result.order.externalId} for ${storeConfig.storeName} (DB ID: ${result.order.id}, Source: ${result.order.source}, New: ${result.isNew})`);

        return NextResponse.json(
            {
                success: true,
                message: result.isNew ? 'Sipariş başarıyla oluşturuldu' : 'Sipariş başarıyla güncellendi',
                id: result.order.id,
                orderNumber: result.order.externalId,
                store: storeConfig.storeName,
                source: storeConfig.source,
            },
            { status: 200 }
        );
    } catch (error: any) {
        console.error('[SHOPIFY_WEBHOOK] Error processing webhook:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
