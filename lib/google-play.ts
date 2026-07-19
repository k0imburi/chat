import "server-only"

import { JWT } from "google-auth-library"
import { CreditKind, TipTier } from "@prisma/client"
import { prisma } from "@/lib/prisma"

// Google Play Billing (Android only) — this is the actual Play Store
// compliance path for digital goods/virtual currency consumed in-app, as
// distinct from "Google Pay" (a payment method, not a store policy; see
// lib/flutterwave.ts). Products are fixed-price and pre-registered in Play
// Console — one product per credit kind, purchasable with a quantity, so
// pricing/allocation logic mirrors the existing per-unit USD prices exactly.
const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher"
const ANDROID_PUBLISHER_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3"

// Exact product IDs expected to exist in Play Console — see the settings
// page / setup docs for the full checklist of what to create there.
export const PRODUCT_TO_CREDIT_KIND: Record<string, CreditKind> = {
  key: "KEY",
  chat_credit: "CHAT_CREDIT",
  voice_session: "VOICE_SESSION",
  video_session: "VIDEO_SESSION",
}
export const PRODUCT_TO_TIP_TIER: Record<string, TipTier> = {
  tip_pebble: "PEBBLE",
  tip_gem: "GEM",
  tip_diamond: "DIAMOND",
}
export const ALL_GOOGLE_PLAY_PRODUCT_IDS = [
  ...Object.keys(PRODUCT_TO_CREDIT_KIND),
  ...Object.keys(PRODUCT_TO_TIP_TIER),
]

export async function resolveGooglePlayConfig() {
  let settings: Record<string, unknown> | null = null
  try {
    settings = (await prisma.appSettings.findUnique({ where: { id: 1 } })) as Record<string, unknown> | null
  } catch {
    settings = null
  }
  const packageName = (settings?.googlePlayPackageName as string | undefined) || "com.chatandtip.app"
  const serviceAccountJson = (settings?.googlePlayServiceAccountJson as string | undefined) || ""
  const flag = (settings?.googlePlayEnabled as boolean | undefined) ?? false
  return { enabled: Boolean(flag) && Boolean(serviceAccountJson), packageName, serviceAccountJson }
}

// Cached per-process, keyed by the service account JSON so a settings change
// picks up a fresh client instead of an old one. JWT handles its own token
// refresh internally — we don't need to manage expiry ourselves here.
let cachedClient: { key: string; client: JWT } | null = null

function getClient(serviceAccountJson: string): JWT {
  if (cachedClient && cachedClient.key === serviceAccountJson) return cachedClient.client
  const creds = JSON.parse(serviceAccountJson) as { client_email: string; private_key: string }
  const client = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: [ANDROID_PUBLISHER_SCOPE],
  })
  cachedClient = { key: serviceAccountJson, client }
  return client
}

export type AndroidPurchaseState = 0 | 1 | 2 // 0 = purchased, 1 = canceled, 2 = pending

export type AndroidPurchase = {
  purchaseState?: AndroidPurchaseState
  consumptionState?: 0 | 1 // 0 = yet to be consumed, 1 = consumed
  orderId?: string
}

// Verify a purchase token server-side before granting anything — never trust
// a purchase state the client itself reports.
export async function getAndroidPurchase(productId: string, purchaseToken: string): Promise<AndroidPurchase> {
  const cfg = await resolveGooglePlayConfig()
  if (!cfg.enabled) throw new Error("Google Play Billing is not configured")
  const client = getClient(cfg.serviceAccountJson)
  const url = `${ANDROID_PUBLISHER_BASE}/applications/${cfg.packageName}/purchases/products/${productId}/tokens/${purchaseToken}`
  const res = await client.request<AndroidPurchase>({ url })
  return res.data
}

// Consuming (not just acknowledging) is what makes a consumable purchasable
// again. Done server-side, after we've verified + granted credits — never
// client-side, since a compromised client could otherwise mark a purchase
// consumed (and therefore repurchasable) before the server ever grants
// anything for it.
export async function consumeAndroidPurchase(productId: string, purchaseToken: string): Promise<void> {
  const cfg = await resolveGooglePlayConfig()
  if (!cfg.enabled) throw new Error("Google Play Billing is not configured")
  const client = getClient(cfg.serviceAccountJson)
  const url = `${ANDROID_PUBLISHER_BASE}/applications/${cfg.packageName}/purchases/products/${productId}/tokens/${purchaseToken}:consume`
  await client.request({ url, method: "POST" })
}
