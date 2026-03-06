import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { generatePKCE } from "@/lib/etsy";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const url = new URL(req.url);
    const shopId = url.searchParams.get("shopId");
    const storeIndexStr = url.searchParams.get("storeIndex");

    let apiKey = process.env.ETSY_API_KEY || "";

    // Fetch specific API key from stores JSON array
    if (storeIndexStr) {
        const storeIndex = parseInt(storeIndexStr);
        const settingsJson = await db.systemSetting.findUnique({ where: { key: 'etsy_stores_json' } });
        if (settingsJson?.value) {
            try {
                const stores = JSON.parse(settingsJson.value);
                if (stores[storeIndex] && stores[storeIndex].apiKey) {
                    apiKey = stores[storeIndex].apiKey;
                }
            } catch (e) {
                console.error("Failed parsing stores JSON", e);
            }
        }
    }

    if (!apiKey) {
        return NextResponse.json({ error: "Etsy API Key is missing for this store. Please enter it in Settings first." }, { status: 400 });
    }

    // Append store index to state to pass context through OAuth
    const baseState = generatePKCE().state;
    const state = `${baseState}:${storeIndexStr || 'legacy'}`;
    const { verifier, challenge } = generatePKCE();

    // Construct dynamic redirect URI from Headers to survive DigitalOcean proxy
    const forwardedHost = req.headers.get("x-forwarded-host");
    const forwardedProto = req.headers.get("x-forwarded-proto") || "https";
    const host = forwardedHost || req.headers.get("host") || url.host;

    // Fallback logic for local development vs production proxy
    let origin = `${forwardedProto}://${host}`;
    if (origin.includes("localhost:8080")) {
        // Digital Ocean sometimes passes local binding if headers are missing
        origin = "https://clownfish-app-nr5vm.ondigitalocean.app";
    }

    const redirectUri = `${origin}/api/etsy/callback`;
    const scopes = "shops_r transactions_r receipts_r";

    const authUrl = `https://www.etsy.com/oauth/connect?response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&client_id=${apiKey}&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;

    const response = NextResponse.redirect(authUrl);

    // Secure cookies for OAuth flow
    response.cookies.set("etsy_pkce_verifier", verifier, {
        httpOnly: true,
        secure: true,
        path: "/",
        maxAge: 60 * 10 // 10 minutes
    });

    response.cookies.set("etsy_oauth_state", state, {
        httpOnly: true,
        secure: true,
        path: "/",
        maxAge: 60 * 10
    });

    return response;
}
