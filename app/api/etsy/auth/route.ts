import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function base64URLEncode(str: Buffer) {
    return str.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function sha256(buffer: string) {
    return crypto.createHash('sha256').update(buffer).digest();
}

export async function GET(req: Request) {
    const url = new URL(req.url);
    const storeIndex = url.searchParams.get("storeIndex");

    // 1. Get API Key strategy:
    // A) Try to find it in the specific store config (if resuming a setup)
    // B) Try to find a GLOBAL API KEY (New "Single App" Mode)
    // C) Fallback to legacy key

    const globalSettings = await db.systemSetting.findUnique({ where: { key: 'etsy_global_api_key' } });
    let apiKey = globalSettings?.value || "";

    if (storeIndex !== null && !apiKey) {
        const settings = await db.systemSetting.findUnique({ where: { key: 'etsy_stores_json' } });
        if (settings?.value) {
            try {
                const stores = JSON.parse(settings.value);
                // If the store has a specific override key, use it. Otherwise keep global.
                if (stores[parseInt(storeIndex)]?.apiKey) {
                    apiKey = stores[parseInt(storeIndex)].apiKey;
                }
            } catch (e) {
                console.error("JSON Parse Error during Auth", e);
            }
        }
    }

    // Fallback to legacy key if still empty
    if (!apiKey) {
        const settings = await db.systemSetting.findUnique({ where: { key: 'etsy_api_key' } });
        apiKey = settings?.value || "";
    }

    if (!apiKey) {
        return NextResponse.json({ error: "Etsy API Key is missing. Please enter it in Settings." }, { status: 400 });
    }

    // 2. Generate PKCE Verifier & Challenge
    const verifier = base64URLEncode(crypto.randomBytes(32));
    const challenge = base64URLEncode(sha256(verifier));
    const randomState = base64URLEncode(crypto.randomBytes(32));

    // Embed store index into state so we know who we are authenticating for in the callback
    const state = `${randomState}:${storeIndex ?? 'legacy'}`;

    // 3. Store Verifier in a cookie
    const origin = url.origin;
    const redirectUri = `${origin}/api/etsy/callback`;
    const scope = "transactions_r%20shops_r%20profile_r";

    const authUrl = `https://www.etsy.com/oauth/connect?response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&client_id=${apiKey}&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;

    const response = NextResponse.redirect(authUrl);

    // Secure cookie for PKCE verifier
    response.cookies.set("etsy_pkce_verifier", verifier, {
        httpOnly: true,
        secure: true,
        path: "/",
        maxAge: 60 * 10 // 10 minutes
    });

    // Store state
    response.cookies.set("etsy_oauth_state", state, {
        httpOnly: true,
        secure: true,
        path: "/",
        maxAge: 60 * 10
    });

    return response;
}
