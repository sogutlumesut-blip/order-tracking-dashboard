// Google Drive Salt Okunur (drive.readonly) OAuth Token Yöneticisi
// Refresh token güvenli şekilde SystemSetting tablosunda saklanır; access token otomatik yenilenir.

import { getDemoDb, getDemoSettingsMap } from "@/lib/demo-engine";

let cachedToken: { token: string; expiresAt: number } | null = null;

export function getPublicOrigin(request: Request): string {
  const fwdHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const fwdProto = request.headers.get("x-forwarded-proto") || "https";
  if (fwdHost && !fwdHost.includes("localhost") && !fwdHost.includes("127.0.0.1")) {
    return `${fwdProto.split(",")[0].trim()}://${fwdHost.split(",")[0].trim()}`;
  }
  return new URL(request.url).origin;
}

export async function getGoogleDriveConfig() {
  const s = await getDemoSettingsMap();
  return {
    clientId: (s.gdrive_client_id || process.env.GOOGLE_DRIVE_CLIENT_ID || "").trim(),
    clientSecret: (s.gdrive_client_secret || process.env.GOOGLE_DRIVE_CLIENT_SECRET || "").trim(),
    refreshToken: (s.gdrive_refresh_token || "").trim(),
    connectedEmail: (s.gdrive_connected_email || "").trim(),
    connectedAt: s.gdrive_connected_at || null,
  };
}

export async function saveGoogleDriveSetting(key: string, value: string) {
  const ddb = getDemoDb();
  await ddb.systemSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function clearGoogleDriveTokens() {
  cachedToken = null;
  const ddb = getDemoDb();
  for (const key of ["gdrive_refresh_token", "gdrive_connected_email", "gdrive_connected_at"]) {
    await ddb.systemSetting.deleteMany({ where: { key } });
  }
}

export async function getValidGoogleDriveAccessToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const cfg = await getGoogleDriveConfig();
  if (!cfg.clientId || !cfg.clientSecret || !cfg.refreshToken) return null;

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) {
    console.error("[gdrive-auth] Token refresh failed:", r.status, await r.text().catch(() => ""));
    return null;
  }
  const d = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!d.access_token) return null;
  cachedToken = {
    token: d.access_token,
    expiresAt: Date.now() + Math.max(300, (d.expires_in || 3600) - 120) * 1000,
  };
  return d.access_token;
}
