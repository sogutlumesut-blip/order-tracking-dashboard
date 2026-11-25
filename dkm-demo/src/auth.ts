// DEMO Kimlik Doğrulama ve Bayi Yetki İzolasyonu
// Parolalar bcryptjs ile hashlenir. Oturumlar HttpOnly çerez + SHA-256 token ile saklanır.

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { Db } from "./db.ts";

export interface DemoUser {
  id: string;
  username: string;
  name: string;
  role: "admin" | "operator" | "dealer";
  dealer_code: string | null;
}

export const SESSION_COOKIE = "dkm_demo_session";

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function createUser(
  db: Db,
  opts: { username: string; password: string; name: string; role: "admin" | "operator" | "dealer"; dealerCode?: string | null },
): DemoUser {
  if (!opts.username || opts.username.length < 3) throw new Error("Kullanıcı adı en az 3 karakter olmalı");
  if (!opts.password || opts.password.length < 8) throw new Error("Parola en az 8 karakter olmalı");
  const hash = bcrypt.hashSync(opts.password, 10);
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(opts.username) as { id: string } | undefined;
  const id = existing?.id || crypto.randomUUID();
  if (existing) {
    db.prepare("UPDATE users SET password_hash = ?, name = ?, role = ?, dealer_code = ? WHERE id = ?").run(
      hash,
      opts.name,
      opts.role,
      opts.dealerCode ?? null,
      id,
    );
  } else {
    db.prepare("INSERT INTO users (id, username, password_hash, name, role, dealer_code) VALUES (?, ?, ?, ?, ?, ?)").run(
      id,
      opts.username,
      hash,
      opts.name,
      opts.role,
      opts.dealerCode ?? null,
    );
  }
  return { id, username: opts.username, name: opts.name, role: opts.role, dealer_code: opts.dealerCode ?? null };
}

export function authenticate(db: Db, username: string, password: string): DemoUser | null {
  const row = db
    .prepare("SELECT id, username, password_hash, name, role, dealer_code FROM users WHERE username = ?")
    .get(username.trim()) as (DemoUser & { password_hash: string }) | undefined;
  if (!row) return null;
  if (!bcrypt.compareSync(password, row.password_hash)) return null;
  return { id: row.id, username: row.username, name: row.name, role: row.role, dealer_code: row.dealer_code };
}

export function createSession(db: Db, userId: string, ttlHours = 24): string {
  const raw = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(hashToken(raw), userId, expiresAt);
  return raw;
}

export function getUserBySession(db: Db, rawToken: string | undefined): DemoUser | null {
  if (!rawToken) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.name, u.role, u.dealer_code, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(hashToken(rawToken)) as (DemoUser & { expires_at: string }) | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(rawToken));
    return null;
  }
  return { id: row.id, username: row.username, name: row.name, role: row.role, dealer_code: row.dealer_code };
}

export function deleteSession(db: Db, rawToken: string | undefined) {
  if (!rawToken) return;
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(rawToken));
}

// Bayi erişim kontrolü: farklı bayilerin siparişlerine yetkisiz erişimi engeller
export function canAccessOrder(user: DemoUser, order: { dealer_code: string }): boolean {
  if (user.role === "admin") return true;
  if (user.role === "operator" && (!user.dealer_code || user.dealer_code === "DKM")) return true;
  return !!user.dealer_code && user.dealer_code === order.dealer_code;
}
