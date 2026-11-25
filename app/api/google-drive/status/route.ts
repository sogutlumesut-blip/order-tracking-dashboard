import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { clearGoogleDriveTokens, getGoogleDriveConfig, getPublicOrigin, saveGoogleDriveSetting } from "@/lib/google-drive-auth";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  }
  const cfg = await getGoogleDriveConfig();
  const origin = getPublicOrigin(request);
  return NextResponse.json({
    ok: true,
    hasCredentials: Boolean(cfg.clientId && cfg.clientSecret),
    clientId: cfg.clientId,
    connected: Boolean(cfg.refreshToken),
    connectedEmail: cfg.connectedEmail,
    connectedAt: cfg.connectedAt,
    redirectUri: `${origin}/api/google-drive/callback`,
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  if (body.action === "disconnect") {
    await clearGoogleDriveTokens();
    return NextResponse.json({ ok: true, message: "Google Drive bağlantısı kaldırıldı." });
  }
  if (body.clientId !== undefined) await saveGoogleDriveSetting("gdrive_client_id", String(body.clientId).trim());
  if (body.clientSecret !== undefined && String(body.clientSecret).trim()) {
    await saveGoogleDriveSetting("gdrive_client_secret", String(body.clientSecret).trim());
  }
  return NextResponse.json({ ok: true, message: "Google Drive API bilgileri kaydedildi. Şimdi 'Google Hesabı ile Bağlan' butonuna basın." });
}
