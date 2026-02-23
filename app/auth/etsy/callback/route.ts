import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/prisma";
import { encrypt } from "@/lib/etsy";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
        console.error("Etsy OAuth Error:", error);
        return NextResponse.redirect(new URL(`/admin/settings?error=etsy_auth_${error}`, req.url));
    }

    const cookieStore = await cookies();
    const verifier = cookieStore.get("etsy_pkce_verifier")?.value;
    const storedState = cookieStore.get("etsy_oauth_state")?.value;

    if (!code || !verifier || !storedState) {
        return NextResponse.redirect(new URL('/admin/settings?error=etsy_missing_params', req.url));
    }

    if (state !== storedState) {
        return NextResponse.redirect(new URL('/admin/settings?error=etsy_invalid_state', req.url));
    }

    // Get API Key
    const globalSettings = await db.systemSetting.findUnique({ where: { key: 'etsy_global_api_key' } });
    const apiKey = globalSettings?.value || process.env.ETSY_API_KEY || "";

    if (!apiKey) {
        return NextResponse.redirect(new URL('/admin/settings?error=etsy_missing_api_key', req.url));
    }

    const redirectUri = process.env.ETSY_REDIRECT_URI || "https://clownfish-app-nr5vm.ondigitalocean.app/auth/etsy/callback";

    try {
        // Exchange code for token
        const tokenResponse = await fetch("https://api.etsy.com/v3/public/oauth/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                grant_type: "authorization_code",
                client_id: apiKey,
                redirect_uri: redirectUri,
                code: code,
                code_verifier: verifier
            }),
        });

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
            console.error("Etsy Token Exchange Error:", tokenData);
            return NextResponse.redirect(new URL(`/admin/settings?error=etsy_token_exchange_failed`, req.url));
        }

        const accessToken = tokenData.access_token;
        const refreshToken = tokenData.refresh_token;
        const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
        const scopes = tokenData.scope;

        // Fetch Shop Details (Auto-discovery)
        // Note: The user_id in the token response is actually the user's Etsy ID
        const userId = tokenData.user_id.split('.')[0];

        const shopRes = await fetch(`https://openapi.etsy.com/v3/application/users/${userId}/shops`, {
            headers: {
                'x-api-key': apiKey,
                'Authorization': `Bearer ${accessToken}`
            }
        });

        const shopData = await shopRes.json();
        let shopId = "";
        let shopName = "Etsy Shop";

        if (shopRes.ok && shopData.results && shopData.results.length > 0) {
            shopId = shopData.results[0].shop_id.toString();
            shopName = shopData.results[0].shop_name;
        } else if (shopRes.ok && shopData.shop_id) {
            shopId = shopData.shop_id.toString();
            shopName = shopData.shop_name;
        } else {
            // Fallback: use user ID as shopId if shops endpoint fails or returns empty
            shopId = userId;
        }

        // Store in Database
        await db.etsyShop.upsert({
            where: { shopId },
            update: {
                accessToken: encrypt(accessToken),
                refreshToken: refreshToken,
                expiresAt,
                scopes,
                shopName
            },
            create: {
                shopId,
                shopName,
                accessToken: encrypt(accessToken),
                refreshToken: refreshToken,
                expiresAt,
                scopes
            }
        });

        return NextResponse.redirect(new URL('/admin/settings?success=etsy_connected', req.url));

    } catch (err) {
        console.error("Etsy Callback Exception:", err);
        return NextResponse.redirect(new URL('/admin/settings?error=etsy_server_error', req.url));
    }
}
