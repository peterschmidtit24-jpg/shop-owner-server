import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "shop_owner_session";
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function createToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
  };
}
