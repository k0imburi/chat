import "server-only"

import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"
import { env } from "@/lib/env"

export const CUSTOMER_SESSION_COOKIE = process.env.NODE_ENV === "production"
  ? "__Host-chatandtip_customer_session"
  : "chatandtip_customer_session"

function customerSecret() {
  if (!env.CUSTOMER_JWT_SECRET) throw new Error("CUSTOMER_JWT_SECRET is required for customer web sessions")
  return new TextEncoder().encode(env.CUSTOMER_JWT_SECRET)
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
