import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"
import { env } from "@/lib/env"

type CheckoutSession = {
  id: string
  url: string | null
  payment_status?: string
  amount_total?: number | null
  currency?: string | null
  metadata?: Record<string, string>
  client_reference_id?: string | null
}

function stripeKey() {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not configured")
  return env.STRIPE_SECRET_KEY
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
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey()}`,
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

export function constructStripeEvent(rawBody: string, signatureHeader: string | null) {
  const secret = env.STRIPE_WEBHOOK_SECRET
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
