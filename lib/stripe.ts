import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"
import { env } from "@/lib/env"
import { prisma } from "@/lib/prisma"

type CheckoutSession = {
  id: string
  url: string | null
  payment_status?: string
  amount_total?: number | null
  currency?: string | null
  metadata?: Record<string, string>
  client_reference_id?: string | null
}

// Stripe config comes from the admin dashboard (AppSettings), falling back to
// env vars. This is what makes Google Pay self-serve: paste keys in Settings
// and flip it on, no redeploy. `enabled` also requires a secret key to exist.
export async function resolveStripeConfig() {
  let settings: Record<string, unknown> | null = null
  try {
    settings = (await prisma.appSettings.findUnique({ where: { id: 1 } })) as Record<string, unknown> | null
  } catch {
    settings = null
  }
  const secretKey = (settings?.stripeSecretKey as string | undefined) || env.STRIPE_SECRET_KEY || ""
  const webhookSecret = (settings?.stripeWebhookSecret as string | undefined) || env.STRIPE_WEBHOOK_SECRET || ""
  const flag = (settings?.stripeEnabled as boolean | undefined) ?? (env.STRIPE_ENABLED === "true")
  return { enabled: Boolean(flag) && Boolean(secretKey), secretKey, webhookSecret }
}

export async function createStripeCheckoutSession(input: {
  purchaseId: string
  userId: string
  amountKes: number
  description: string
  successUrl: string
  cancelUrl: string
}) {
  const body = new URLSearchParams({
    mode: "payment",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.purchaseId,
    "line_items[0][price_data][currency]": "kes",
    "line_items[0][price_data][unit_amount]": String(Math.round(input.amountKes * 100)),
    "line_items[0][price_data][product_data][name]": input.description,
    "line_items[0][quantity]": "1",
    "metadata[purchaseId]": input.purchaseId,
    "metadata[userId]": input.userId,
    "metadata[purpose]": "credit_purchase",
    "payment_intent_data[metadata][purchaseId]": input.purchaseId,
  })
  const { secretKey } = await resolveStripeConfig()
  if (!secretKey) throw new Error("Stripe is not configured")
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": `credit-purchase-${input.purchaseId}`,
    },
    body,
    cache: "no-store",
  })
  const data = await response.json() as CheckoutSession & { error?: { message?: string } }
  if (!response.ok || !data.id || !data.url) throw new Error(data.error?.message || "Stripe could not create checkout")
  return data
}

export function constructStripeEvent(rawBody: string, signatureHeader: string | null, webhookSecret?: string) {
  const secret = webhookSecret || env.STRIPE_WEBHOOK_SECRET
  if (!secret || !signatureHeader) throw new Error("Stripe webhook signature is not configured")
  const values = signatureHeader.split(",").map((part) => part.trim().split("="))
  const timestamp = values.find(([key]) => key === "t")?.[1]
  const signatures = values.filter(([key]) => key === "v1").map(([, value]) => value)
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw new Error("Invalid Stripe webhook timestamp")
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex")
  const valid = signatures.some((candidate) => {
    try {
      const left = Buffer.from(candidate, "hex"), right = Buffer.from(expected, "hex")
      return left.length === right.length && timingSafeEqual(left, right)
    } catch { return false }
  })
  if (!valid) throw new Error("Invalid Stripe webhook signature")
  return JSON.parse(rawBody) as {
    id: string
    type: string
    data: { object: CheckoutSession }
  }
}
