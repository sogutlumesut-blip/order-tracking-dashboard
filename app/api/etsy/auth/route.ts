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
    // 1. Get Settings
    const settings = await db.systemSetting.findMany({
        where: {
            key: { in: ['etsy_api_key', 'etsy_shop_id'] }
        }
    });

    const apiKey = settings.find(s => s.key === 'etsy_api_key')?.value;

    if (!apiKey) {
        return NextResponse.json({ error: "Etsy API Key (Keystring) is missing in Settings." }, { status: 400 });
    }

    // 2. Generate PKCE Verifier & Challenge
    const verifier = base64URLEncode(crypto.randomBytes(32));
    const challenge = base64URLEncode(sha256(verifier));
    const state = base64URLEncode(crypto.randomBytes(32));

    // 3. Store Verifier in a cookie (or DB) to verify later
    // For simplicity, we can use a cookie
    const url = new URL(req.url);
    const origin = url.origin; // e.g., https://your-site.vercel.app
    const redirectUri = `${origin}/api/etsy/callback`;
    const scope = "transactions_r%20shops_r%20profile_r"; // Read transactions, shops, profile

    const authUrl = `https://www.etsy.com/oauth/connect?response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&client_id=${apiKey}&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;

    const response = NextResponse.redirect(authUrl);

    // Secure cookie for PKCE verifier
    response.cookies.set("etsy_pkce_verifier", verifier, {
        httpOnly: true,
        secure: true,
        path: "/",
        maxAge: 60 * 10 // 10 minutes
    });

    // Also store state to prevent CSRF
    response.cookies.set("etsy_oauth_state", state, {
        httpOnly: true,
        secure: true,
        path: "/",
        maxAge: 60 * 10
    });

    return response;
}
