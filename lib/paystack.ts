import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"
import { env } from "@/lib/env"
import { prisma } from "@/lib/prisma"

// Paystack config comes from the admin dashboard (AppSettings), falling back to
// env. Paystack is the primary gateway for Google Pay + M-PESA + cards (KES).
// `enabled` also requires a secret key to exist.
export async function resolvePaystackConfig() {
  let settings: Record<string, unknown> | null = null
  try {
    settings = (await prisma.appSettings.findUnique({ where: { id: 1 } })) as Record<string, unknown> | null
  } catch {
    settings = null
  }
  const secretKey = (settings?.paystackSecretKey as string | undefined) || env.PAYSTACK_SECRET_KEY || ""
  const publicKey = (settings?.paystackPublicKey as string | undefined) || env.PAYSTACK_PUBLIC_KEY || ""
  const flag = (settings?.paystackEnabled as boolean | undefined) ?? (env.PAYSTACK_ENABLED === "true")
  return { enabled: Boolean(flag) && Boolean(secretKey), secretKey, publicKey }
}

// Initialize a Paystack transaction; returns the hosted-checkout URL (which
// offers Google Pay / M-PESA / cards) for the app or web to open.
export async function initializePaystackTransaction(input: {
  reference: string
  amountKes: number
  email: string
  callbackUrl: string
}): Promise<{ authorizationUrl: string }> {
  const { secretKey } = await resolvePaystackConfig()
  if (!secretKey) throw new Error("Paystack is not configured")

  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // Paystack amounts are in the currency subunit (KES → cents).
      amount: Math.round(input.amountKes * 100),
      currency: "KES",
      email: input.email,
      reference: input.reference,
      callback_url: input.callbackUrl,
      channels: ["card", "mobile_money", "bank", "apple_pay"],
    }),
    cache: "no-store",
  })
  const data = (await response.json()) as {
    status?: boolean
    message?: string
    data?: { authorization_url?: string }
  }
  if (!response.ok || !data.status || !data.data?.authorization_url) {
    throw new Error(data.message || "Paystack could not start checkout")
  }
  return { authorizationUrl: data.data.authorization_url }
}

// Verify a Paystack webhook: HMAC-SHA512 of the raw body with the secret key,
// compared to the x-paystack-signature header.
export function verifyPaystackSignature(rawBody: string, signature: string | null, secretKey: string) {
  if (!signature || !secretKey) return false
  const expected = createHmac("sha512", secretKey).update(rawBody, "utf8").digest("hex")
  try {
    const left = Buffer.from(signature, "hex")
    const right = Buffer.from(expected, "hex")
    return left.length === right.length && timingSafeEqual(left, right)
  } catch {
    return false
  }
}
