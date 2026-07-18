import "server-only"

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"
import { env } from "@/lib/env"
import { prisma } from "@/lib/prisma"

// Flutterwave is used ONLY for Google Pay — Paystack has no Google Pay support
// at all (confirmed against their docs), so this exists purely to fill that
// one gap. Card/M-PESA stay on Paystack.
//
// v4 API note: Flutterwave's v4 is OAuth2 (client-credentials), not a single
// secret key like v3/Paystack/Stripe — every call needs a short-lived Bearer
// token fetched from their identity server first. The resource API base URL
// is also dashboard-editable here rather than hardcoded: v4 is a new API and
// its sandbox/production hosts have differed across Flutterwave's own docs
// revisions, so a wrong hardcoded guess would be a silent, hard-to-diagnose
// failure. Confirm the exact production base URL from your Flutterwave
// dashboard/docs once you have an account, and paste it into Settings.
const TOKEN_URL = "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token"

export async function resolveFlutterwaveConfig() {
  let settings: Record<string, unknown> | null = null
  try {
    settings = (await prisma.appSettings.findUnique({ where: { id: 1 } })) as Record<string, unknown> | null
  } catch {
    settings = null
  }
  const clientId = (settings?.flutterwaveClientId as string | undefined) || env.FLUTTERWAVE_CLIENT_ID || ""
  const clientSecret = (settings?.flutterwaveClientSecret as string | undefined) || env.FLUTTERWAVE_CLIENT_SECRET || ""
  const secretHash = (settings?.flutterwaveSecretHash as string | undefined) || env.FLUTTERWAVE_SECRET_HASH || ""
  const baseUrl = ((settings?.flutterwaveBaseUrl as string | undefined) || env.FLUTTERWAVE_BASE_URL || "").replace(/\/$/, "")
  const currency = (settings?.flutterwaveCurrency as string | undefined) || env.FLUTTERWAVE_CURRENCY || "KES"
  const flag = (settings?.flutterwaveEnabled as boolean | undefined) ?? (env.FLUTTERWAVE_ENABLED === "true")
  return {
    enabled: Boolean(flag) && Boolean(clientId) && Boolean(clientSecret),
    clientId,
    clientSecret,
    secretHash,
    baseUrl,
    currency,
  }
}

// Cached per-process; a v4 access token is short-lived (typically ~10 min).
// Keyed by clientId so switching credentials on the settings page doesn't
// serve a stale token for the old account.
let cachedToken: { clientId: string; token: string; expiresAt: number } | null = null

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  if (cachedToken && cachedToken.clientId === clientId && cachedToken.expiresAt > Date.now() + 15_000) {
    return cachedToken.token
  }
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
    cache: "no-store",
  })
  const data = (await response.json()) as { access_token?: string; expires_in?: number; error_description?: string }
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || "Could not authenticate with Flutterwave")
  }
  cachedToken = {
    clientId,
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 600) * 1000,
  }
  return cachedToken.token
}

async function flutterwaveFetch(
  cfg: { baseUrl: string; clientId: string; clientSecret: string },
  path: string,
  init: { method: string; body?: unknown },
) {
  const token = await getAccessToken(cfg.clientId, cfg.clientSecret)
  const response = await fetch(`${cfg.baseUrl}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": randomUUID(),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  })
  const data = (await response.json()) as Record<string, unknown>
  if (!response.ok) {
    const message = (data as { message?: string; error?: { message?: string } }).message
      || (data as { error?: { message?: string } }).error?.message
      || "Flutterwave request failed"
    throw new Error(message)
  }
  return data
}

// Runs the full Google Pay charge sequence (customer -> payment method ->
// charge) and returns the URL to send the customer to for authorization.
// `reference` should be the CreditPurchase id, mirroring the Paystack flow,
// so the webhook can match the completed charge back to it.
export async function initializeFlutterwaveGooglePayTransaction(input: {
  reference: string
  amountKes: number
  email: string
  redirectUrl: string
}): Promise<{ authorizationUrl: string }> {
  const cfg = await resolveFlutterwaveConfig()
  if (!cfg.enabled) throw new Error("Flutterwave (Google Pay) is not configured")

  const customer = await flutterwaveFetch(cfg, "/customers", {
    method: "POST",
    body: { email: input.email },
  })
  const customerId = (customer.data as { id?: string } | undefined)?.id
  if (!customerId) throw new Error("Flutterwave did not return a customer id")

  const paymentMethod = await flutterwaveFetch(cfg, "/payment-methods", {
    method: "POST",
    body: { type: "googlepay", googlepay: { card_holder_name: input.email } },
  })
  const paymentMethodId = (paymentMethod.data as { id?: string } | undefined)?.id
  if (!paymentMethodId) throw new Error("Flutterwave did not return a payment method id")

  // UNVERIFIED — Flutterwave's docs samples show plain amounts (e.g. 150 for
  // a $150 charge), matching their v3 API's long-standing "major units, not
  // cents" convention (unlike Paystack/Stripe, which use subunits). Confirm
  // this against a real sandbox charge before enabling live payments — if v4
  // actually expects subunits here, every charge would be 100x wrong.
  const charge = await flutterwaveFetch(cfg, "/charges", {
    method: "POST",
    body: {
      currency: cfg.currency,
      customer_id: customerId,
      payment_method_id: paymentMethodId,
      amount: Math.round(input.amountKes),
      reference: input.reference,
      redirect_url: input.redirectUrl,
    },
  })
  const chargeData = charge.data as { next_action?: { redirect_url?: { url?: string } } } | undefined
  const authorizationUrl = chargeData?.next_action?.redirect_url?.url
  if (!authorizationUrl) throw new Error("Flutterwave did not return a redirect URL")
  return { authorizationUrl }
}

// Verify a Flutterwave webhook: HMAC-SHA256 of the raw body with the
// dashboard-configured secret hash, compared to the flutterwave-signature
// header. Same shape as verifyPaystackSignature, different algorithm/header.
export function verifyFlutterwaveSignature(rawBody: string, signature: string | null, secretHash: string) {
  if (!signature || !secretHash) return false
  const expected = createHmac("sha256", secretHash).update(rawBody, "utf8").digest("hex")
  try {
    const left = Buffer.from(signature, "hex")
    const right = Buffer.from(expected, "hex")
    return left.length === right.length && timingSafeEqual(left, right)
  } catch {
    return false
  }
}
