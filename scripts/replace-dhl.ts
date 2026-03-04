import fs from 'fs';
let code = fs.readFileSync('app/actions.ts', 'utf-8');

const startIndex = code.indexOf('export async function createDHLShipmentAction(orderId: number) {');
const endIndex = code.indexOf('export async function simulateWooCommerceOrder() {');

if (startIndex > -1 && endIndex > -1) {
    const before = code.substring(0, startIndex);
    const after = code.substring(endIndex);
    const newFunc = `export async function createDHLShipmentAction(orderId: number) {
    noStore()
    serverLog(\`[DHL_PLUGIN] START: Triggering Kargo Entegratör via WooCommerce for Order #\${orderId}\`);

    const session = await getSession();
    if (!session) {
        serverLog(\`[DHL_PLUGIN] ERR: No session for #\${orderId}\`);
        return { error: "Oturum kapalı" }
    }

    const settings = await getSystemSettings()
    const wcUrl = settings['wc_url'];
    const wcKey = settings['wc_key'];
    const wcSecret = settings['wc_secret'];

    if (!wcUrl || !wcKey || !wcSecret) {
        serverLog(\`[DHL_PLUGIN] ERR: Missing WooCommerce API credentials for #\${orderId}\`);
        return { error: "Lütfen Ayarlar sayfasından WooCommerce (API) bilgilerinizi eksiksiz girin." }
    }

    try {
        const order = await db.order.findUnique({
            where: { id: orderId }
        })

        if (!order) {
            serverLog(\`[DHL_PLUGIN] ERR: Order not found #\${orderId}\`);
            return { error: "Sipariş bulunamadı" }
        }

        if (order.source !== 'woo' || !order.externalId) {
            serverLog(\`[DHL_PLUGIN] ERR: Order is not from WooCommerce or missing external ID.\`);
            return { error: "Yalnızca WooCommerce formundan gelen siparişler için otomatik barkod alınabilir." }
        }

        await logActivity(orderId, session.user.name, "CARGO_START", "Kargo Entegratör'ü tetiklemek üzere WooCommerce sipariş durumu güncelleniyor.")

        serverLog(\`[DHL_PLUGIN] Calling WooCommerce API for external ID: \${order.externalId}...\`);

        // We update the order status to "completed" to trigger the Kargo Entegratör plugin
        const response = await fetch(\`\${wcUrl}/wp-json/wc/v3/orders/\${order.externalId}\`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(\`\${wcKey}:\${wcSecret}\`).toString('base64')
            },
            body: JSON.stringify({
                status: 'completed'
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            serverLog(\`[DHL_PLUGIN] FATAL_HTTP_ERR: \${response.status} - \${errorText}\`);
            return { error: \`WooCommerce bağlantı hatası: \${response.status}\` }
        }

        serverLog(\`[DHL_PLUGIN] SUCCESS: WooCommerce order status changed to completed.\`);

        // Update local DB to shipped status and DHL/MNG cargo
        await db.order.update({
            where: { id: orderId },
            data: {
                status: "shipped",
                cargoCompany: "DHL/MNG",
                updatedAt: new Date()
            }
        })

        await logActivity(orderId, session.user.name, "CARGO_SUCCESS", \`Mağazaya kargo talebi iletildi. Barkodun dönmesi bekleniyor...\`)
        return { success: true, message: "Kargo barkodu isteği mağazaya iletildi. Birkaç saniye içinde sayfayı yenilediğinizde barkodunuz görünecektir." }

    } catch (e: any) {
        serverLog(\`[DHL_PLUGIN] CRITICAL_ERROR: \${e.message}\`);
        return { error: e.message }
    }
}

`;
    fs.writeFileSync('app/actions.ts', before + newFunc + after);
    console.log("Replaced successfully!");
} else {
    console.log("Could not find start or end index.");
}
