import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getGoogleDriveConfig, getPublicOrigin } from "@/lib/google-drive-auth";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Yalnızca yönetici Google Drive bağlayabilir." }, { status: 403 });
  }

  const cfg = await getGoogleDriveConfig();
  const origin = getPublicOrigin(request);
  if (!cfg.clientId || !cfg.clientSecret) {
    return NextResponse.redirect(`${origin}/admin/settings?gdrive=missing_keys`);
  }

  const redirectUri = `${origin}/api/google-drive/callback`;
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email",
    access_type: "offline",
    prompt: "consent",
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
