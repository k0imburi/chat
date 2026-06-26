import "server-only"

import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"
import { env } from "@/lib/env"

export const CUSTOMER_SESSION_COOKIE = process.env.NODE_ENV === "production"
  ? "__Host-chatandtip_customer_session"
  : "chatandtip_customer_session"

function customerSecret() {
  // Prefer a dedicated customer secret for isolation, but fall back to the
  // shared JWT_SECRET so customer web login works without extra config. The
  // "chatandtip-customer" audience still distinguishes these cookies.
  const secret = env.CUSTOMER_JWT_SECRET || env.JWT_SECRET
  if (!secret) throw new Error("CUSTOMER_JWT_SECRET or JWT_SECRET is required for customer web sessions")
  return new TextEncoder().encode(secret)
}

export async function signCustomerSession(userId: string) {
  return new SignJWT({ userId, audience: "chatandtip-customer" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience("chatandtip-customer")
    .setExpirationTime("7d")
    .sign(customerSecret())
}

export async function readCustomerSession(token: string) {
  const { payload } = await jwtVerify<{ userId: string }>(token, customerSecret(), { audience: "chatandtip-customer" })
  return payload
}

export async function getCustomerSession() {
  const token = (await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value
  if (!token) return null
  try { return await readCustomerSession(token) } catch { return null }
}
