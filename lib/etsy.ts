import crypto from 'crypto';
import { db } from './prisma';

const ETSY_API_KEY = process.env.ETSY_API_KEY || "";
const ETSY_REDIRECT_URI = process.env.ETSY_REDIRECT_URI || "";
const ENCRYPTION_KEY = process.env.SECRET_KEY || "fallback-secret-key-at-least-32-chars-long";

// Helper for PKCE
export function generatePKCE() {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');
    return { verifier, challenge, state };
}

// Encryption helpers
export function encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    // Ensure key is 32 bytes
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string): string {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

export async function refreshEtsyToken(shopId: string) {
    const shop = await db.etsyShop.findUnique({ where: { shopId } });
    if (!shop) throw new Error("Shop not found");

    const response = await fetch("https://api.etsy.com/v3/public/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            grant_type: "refresh_token",
            client_id: ETSY_API_KEY,
            refresh_token: shop.refreshToken,
        }),
    });

    const data = await response.json();
    if (!response.ok) {
        console.error("Failed to refresh Etsy token", data);
        throw new Error(data.error_description || "Failed to refresh token");
    }

    const updatedShop = await db.etsyShop.update({
        where: { shopId },
        data: {
            accessToken: encrypt(data.access_token),
            refreshToken: data.refresh_token,
            expiresAt: new Date(Date.now() + data.expires_in * 1000),
        },
    });

    return decrypt(updatedShop.accessToken);
}

export async function getEtsyAccessToken(shopId: string) {
    const shop = await db.etsyShop.findUnique({ where: { shopId } });
    if (!shop) throw new Error("Shop not found");

    if (shop.expiresAt < new Date()) {
        return await refreshEtsyToken(shopId);
    }

    return decrypt(shop.accessToken);
}

export async function fetchEtsy(endpoint: string, shopId: string, options: RequestInit = {}) {
    const token = await getEtsyAccessToken(shopId);

    const response = await fetch(`https://openapi.etsy.com/v3/application/${endpoint}`, {
        ...options,
        headers: {
            ...options.headers,
            "x-api-key": ETSY_API_KEY,
            "Authorization": `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        const error = await response.json();
        console.error(`Etsy API Error (${endpoint}):`, error);
        throw new Error(error.error || "Etsy API request failed");
    }

    return await response.json();
}
