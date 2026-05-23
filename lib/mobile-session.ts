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

export async function getMobileSessionFromRequest(request: Request) {
  const header = request.headers.get("authorization") || request.headers.get("Authorization")
  if (!header?.startsWith("Bearer ")) return null

  try {
    return await readMobileSessionToken(header.slice("Bearer ".length))
  } catch {
    return null
  }
}
