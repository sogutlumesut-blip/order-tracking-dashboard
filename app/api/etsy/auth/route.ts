import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { generatePKCE } from "@/lib/etsy";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const url = new URL(req.url);
    const shopId = url.searchParams.get("shopId"); // Use shopId if connecting an existing one

    // Get API Key from SystemSetting or Env
    const globalSettings = await db.systemSetting.findUnique({ where: { key: 'etsy_global_api_key' } });
    const apiKey = globalSettings?.value || process.env.ETSY_API_KEY || "";

    if (!apiKey) {
        return NextResponse.json({ error: "Etsy API Key is missing. Please enter it in Settings." }, { status: 400 });
    }

    const { verifier, challenge, state } = generatePKCE();

    // Redirect URI as specified by user
    const redirectUri = process.env.ETSY_REDIRECT_URI || "https://clownfish-app-nr5vm.ondigitalocean.app/auth/etsy/callback";
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
