import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Env } from "../config/env.js";
import { AppError } from "../../shared/errors.js";

export function verifyTelegramWebhookSecret(headerValue: string | undefined, expected: string): void {
  if (!headerValue || headerValue !== expected) {
    throw new AppError(401, "UNAUTHORIZED", "Invalid Telegram webhook secret");
  }
}

export function createLoginToken(userId: string, env: Env, ttlMinutes = 30): string {
  const expiresAt = Date.now() + ttlMinutes * 60_000;
  const payload = `${userId}.${expiresAt}`;
  const signature = createHmac("sha256", env.AUTH_TOKEN_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}.${signature}`).toString("base64url");
}

export function parseLoginToken(token: string, env: Env): { userId: string } {
  const decoded = Buffer.from(token, "base64url").toString("utf8");
  const [userId, expiresAtRaw, signature] = decoded.split(".");
  if (!userId || !expiresAtRaw || !signature) {
    throw new AppError(401, "INVALID_TOKEN", "Invalid login token");
  }

  const payload = `${userId}.${expiresAtRaw}`;
  const expected = createHmac("sha256", env.AUTH_TOKEN_SECRET).update(payload).digest("hex");
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new AppError(401, "INVALID_TOKEN", "Invalid login token");
  }

  if (Number(expiresAtRaw) < Date.now()) {
    throw new AppError(401, "TOKEN_EXPIRED", "Login token expired");
  }

  return { userId };
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
