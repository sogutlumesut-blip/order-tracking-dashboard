import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
        return NextResponse.redirect(new URL(`/admin/settings?error=${error}`, req.url));
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
        return NextResponse.redirect(new URL('/admin/settings?error=missing_params', req.url));
    }

    if (state !== storedState) {
        return NextResponse.redirect(new URL('/admin/settings?error=invalid_state', req.url));
    }

    // 2. Get API Key
    const settings = await db.systemSetting.findUnique({
        where: { key: 'etsy_api_key' }
    });
    const clientId = settings?.value;

    if (!clientId) {
        return NextResponse.redirect(new URL('/admin/settings?error=missing_api_key', req.url));
    }

    // 3. Exchange Code for Token
    const tokenUrl = "https://api.etsy.com/v3/public/oauth/token";
    const url = new URL(req.url);
    const origin = url.origin;
    const redirectUri = `${origin}/api/etsy/callback`;

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
            return NextResponse.redirect(new URL(`/admin/settings?error=token_exchange_failed&details=${data.error}`, req.url));
        }

        // 4. Save Tokens
        // data contains: access_token, refresh_token, varies-in (expires), etc.
        const accessToken = data.access_token;
        const refreshToken = data.refresh_token;
        // Etsy tokens expire in 1 hour (3600 seconds) typically.
        const expiresIn = data.expires_in; // seconds

        await db.systemSetting.upsert({ where: { key: 'etsy_access_token' }, update: { value: accessToken }, create: { key: 'etsy_access_token', value: accessToken } });
        await db.systemSetting.upsert({ where: { key: 'etsy_refresh_token' }, update: { value: refreshToken }, create: { key: 'etsy_refresh_token', value: refreshToken } });

        // Also get Shop ID if not present? 
        // We can fetch user profile to get Shop ID if needed, 
        // but user enters it manually for now which is safer.

        revalidatePath("/admin/settings");

        return NextResponse.redirect(new URL('/admin/settings?success=etsy_connected', req.url));

    } catch (e) {
        console.error("Callback Error:", e);
        return NextResponse.redirect(new URL('/admin/settings?error=server_error', req.url));
    }
}
