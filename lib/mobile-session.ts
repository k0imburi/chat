import "server-only"

import { SignJWT, jwtVerify } from "jose"
import { env } from "@/lib/env"

const secret = new TextEncoder().encode(env.JWT_SECRET)

export type MobileSessionUser = {
  userId: string
  email?: string | null
  phoneNumber?: string | null
  loginProvider: string
}

type MobileSessionPayload = MobileSessionUser & {
  exp?: number
  iat?: number
}

export async function signMobileSessionToken(user: MobileSessionUser) {
  return new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(env.MOBILE_JWT_EXPIRES_IN)
    .sign(secret)
}

export async function readMobileSessionToken(token: string) {
  const { payload } = await jwtVerify<MobileSessionPayload>(token, secret)
  return payload
}

// ── One-time checkout token ────────────────────────────────────────
// Minted by the authenticated app so a user can complete payment on the
// website without a full web login. Short-lived and single-purpose.
export async function signCheckoutToken(userId: string) {
  return new SignJWT({ userId, purpose: "checkout" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(secret)
}

export async function readCheckoutToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify<{ userId?: string; purpose?: string }>(token, secret)
    if (payload.purpose !== "checkout" || !payload.userId) return null
    return payload.userId
  } catch {
    return null
  }
}

export async function getCheckoutUserFromRequest(request: Request) {
  const cookie = request.headers.get("cookie") || ""
  const token = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("chatandtip_checkout="))?.slice("chatandtip_checkout=".length)
  return token ? readCheckoutToken(decodeURIComponent(token)) : null
}

export async function getMobileSessionFromRequest(request: Request) {
  const header = request.headers.get("authorization") || request.headers.get("Authorization")
  if (!header?.startsWith("Bearer ")) return null

  try {
    return await readMobileSessionToken(header.slice("Bearer ".length))
  } catch {
    return null
  }
}
