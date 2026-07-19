import { NextResponse } from "next/server"
import { isMpesaAvailable, resolveMpesaConfig } from "@/lib/mpesa"
import { resolveStripeConfig } from "@/lib/stripe"

const STORE_CHANNELS = new Set(["play", "appstore"])

export async function GET(request: Request) {
  const url = new URL(request.url)
  const platform = (url.searchParams.get("platform") || "web").toLowerCase()
  const channel = (url.searchParams.get("channel") || (platform === "web" ? "web" : "store")).toLowerCase()
  const storeBuild = STORE_CHANNELS.has(channel)
  const webPayments = platform === "web" || channel === "direct"
  const mpesa = await isMpesaAvailable(await resolveMpesaConfig())
  const stripeEnabled = (await resolveStripeConfig()).enabled

  return NextResponse.json({
    success: true,
    data: {
      platform,
      channel,
      payments: {
        showPurchaseEntryPoint: webPayments && mpesa,
        mpesa: webPayments && mpesa,
        stripe: webPayments && stripeEnabled,
        nativeBilling: false,
        consumptionOnly: storeBuild,
      },
      economy: true,
      paidReplies: true,
      tips: true,
      bookings: true,
      broadcasts: true,
    },
  })
}
