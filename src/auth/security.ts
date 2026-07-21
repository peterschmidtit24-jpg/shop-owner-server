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
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: isProduction,
    // The Vercel client and API use different hostnames, so production
    // requests need an explicitly cross-site cookie. Local development stays
    // on Lax because it runs over HTTP.
    sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
  };
}
