import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const url = new URL(req.url);
    const forwardedHost = req.headers.get("x-forwarded-host");
    const forwardedProto = req.headers.get("x-forwarded-proto") || "https";
    const host = forwardedHost || req.headers.get("host") || url.host;

    let appUrl = `${forwardedProto}://${host}`;
    if (appUrl.includes("localhost:8080")) {
        appUrl = "https://clownfish-app-nr5vm.ondigitalocean.app";
    }

    const { searchParams } = url;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
        return NextResponse.redirect(new URL(`/admin/settings?error=${error}`, appUrl));
    }

    // 1. Get Cookies
    // Note: We need to parse cookies manually or use next/headers if available, 
    // but Request object has 'headers' we can parse 'cookie' from.
    // Making it safer by using `cookies()` from next/headers in Next.js 13+ App Dir
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const verifier = cookieStore.get("etsy_pkce_verifier")?.value;
    const storedState = cookieStore.get("etsy_oauth_state")?.value;

    if (!code || !verifier || !storedState) {
        return NextResponse.redirect(new URL('/admin/settings?error=missing_params', appUrl));
    }

    if (state !== storedState) {
        return NextResponse.redirect(new URL('/admin/settings?error=invalid_state', appUrl));
    }

    // 3. Resolve Client ID & Store Context
    // Parse State: "RandomString:StoreIndex"
    const [randomPart, storeIndexRef] = (storedState || "").split(":");
    const storeIndex = storeIndexRef === 'legacy' ? null : parseInt(storeIndexRef);

    let clientId = "";
    let stores: any[] = [];

    // Load stores if needed
    if (storeIndex !== null && !isNaN(storeIndex)) {
        const settingsJson = await db.systemSetting.findUnique({ where: { key: 'etsy_stores_json' } });
        try {
            if (settingsJson?.value) {
                stores = JSON.parse(settingsJson.value);
                clientId = stores[storeIndex]?.apiKey;
            }
        } catch (e) {
            console.error("JSON Parse Error", e);
        }
    }

    // Fallback to Legacy
    if (!clientId) {
        const settings = await db.systemSetting.findUnique({ where: { key: 'etsy_api_key' } });
        clientId = settings?.value || "";
    }

    if (!clientId) {
        return NextResponse.redirect(new URL('/admin/settings?error=missing_api_key', appUrl));
    }

    // 4. Exchange Code for Token
    const tokenUrl = "https://api.etsy.com/v3/public/oauth/token";
    const redirectUri = `${appUrl}/api/etsy/callback`;

    try {
        const response = await fetch(tokenUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                grant_type: "authorization_code",
                client_id: clientId,
                redirect_uri: redirectUri,
                code: code,
                code_verifier: verifier
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Token Exchange Error:", data);
            return NextResponse.redirect(new URL(`/admin/settings?error=token_exchange_failed&details=${data.error}`, appUrl));
        }

        const accessToken = data.access_token;
        const refreshToken = data.refresh_token;

        // 5. Save Tokens
        if (storeIndex !== null && !isNaN(storeIndex) && stores[storeIndex]) {
            // Save to Multi-Store Array
            stores[storeIndex].accessToken = accessToken;
            stores[storeIndex].refreshToken = refreshToken;
            stores[storeIndex].connected = true;

            // 6. AUTO-DISCOVERY: Fetch Shop Details
            try {
                // Fetch User's Shops
                // Note: v3/application/users/{user_id}/shops might require 'shops_r' scope
                const userId = (data as any).user_id?.split('.')[0];
                if (userId) {
                    stores[storeIndex].accountId = userId;

                    const shopRes = await fetch(`https://openapi.etsy.com/v3/application/users/${userId}/shops`, {
                        headers: {
                            'x-api-key': clientId,
                            'Authorization': `Bearer ${accessToken}`
                        }
                    });

                    if (shopRes.ok) {
                        const shopData = await shopRes.json();
                        if (shopData.shop_id) {
                            // Single shop returned? Or list? Etsy V3 usually returns the shop object directly for this endpoint
                            stores[storeIndex].shopId = shopData.shop_id.toString();
                            stores[storeIndex].name = shopData.shop_name || stores[storeIndex].name;
                            stores[storeIndex].shopUrl = shopData.url;
                        }
                        // Sometimes it returns { count: 1, results: [...] } depending on endpoint version/docs
                        else if (shopData.results && shopData.results.length > 0) {
                            stores[storeIndex].shopId = shopData.results[0].shop_id.toString();
                            stores[storeIndex].name = shopData.results[0].shop_name || stores[storeIndex].name;
                            stores[storeIndex].shopUrl = shopData.results[0].url;
                        }
                    }
                }
            } catch (shopErr) {
                console.error("Auto-Discovery Error:", shopErr);
            }

            await db.systemSetting.upsert({
                where: { key: 'etsy_stores_json' },
                update: { value: JSON.stringify(stores) },
                create: { key: 'etsy_stores_json', value: JSON.stringify(stores) }
            });
        } else {
            // Save to Legacy Keys
            // await db.systemSetting.upsert({ where: { key: 'etsy_access_token' }, update: { value: accessToken }, create: { key: 'etsy_access_token', value: accessToken } });
            // await db.systemSetting.upsert({ where: { key: 'etsy_refresh_token' }, update: { value: refreshToken }, create: { key: 'etsy_refresh_token', value: refreshToken } });
            console.warn("Legacy Etsy Auth Flow triggered but ignored in favor of Multi-Store.");
        }

        revalidatePath("/admin/settings");

        return NextResponse.redirect(new URL('/admin/settings?success=etsy_connected', appUrl));

    } catch (e) {
        console.error("Callback Error:", e);
        return NextResponse.redirect(new URL('/admin/settings?error=server_error', appUrl));
    }
}
