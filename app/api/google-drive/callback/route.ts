import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getGoogleDriveConfig, saveGoogleDriveSetting } from "@/lib/google-drive-auth";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.user.role !== "admin") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");
  if (err || !code) {
    return NextResponse.redirect(new URL(`/admin/settings?gdrive=error&reason=${encodeURIComponent(err || "no_code")}`, request.url));
  }

  const cfg = await getGoogleDriveConfig();
  const redirectUri = `${url.origin}/api/google-drive/callback`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = (await tokenRes.json()) as { access_token?: string; refresh_token?: string; error?: string };
  if (!tokenRes.ok || !tokenData.access_token) {
    return NextResponse.redirect(new URL(`/admin/settings?gdrive=error&reason=${encodeURIComponent(tokenData.error || "token_failed")}`, request.url));
  }

  let email = "Google Hesabı";
  try {
    const uRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (uRes.ok) {
      const u = (await uRes.json()) as { email?: string };
      if (u.email) email = u.email;
    }
  } catch {}

  if (tokenData.refresh_token) {
    await saveGoogleDriveSetting("gdrive_refresh_token", tokenData.refresh_token);
  }
  await saveGoogleDriveSetting("gdrive_connected_email", email);
  await saveGoogleDriveSetting("gdrive_connected_at", new Date().toISOString());

  return NextResponse.redirect(new URL("/admin/settings?gdrive=connected", request.url));
}
