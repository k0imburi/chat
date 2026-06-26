import { NextResponse } from "next/server"
import { env } from "@/lib/env"
import { isMpesaConfigComplete, resolveMpesaConfig } from "@/lib/mpesa"

const STORE_CHANNELS = new Set(["play", "appstore"])

export async function GET(request: Request) {
  const url = new URL(request.url)
  const platform = (url.searchParams.get("platform") || "web").toLowerCase()
  const channel = (url.searchParams.get("channel") || (platform === "web" ? "web" : "store")).toLowerCase()
  const storeBuild = STORE_CHANNELS.has(channel)
  const webPayments = platform === "web" || channel === "direct"
  const mpesa = env.MPESA_ENABLED === "true" && isMpesaConfigComplete(await resolveMpesaConfig())

  return NextResponse.json({
    success: true,
    data: {
      platform,
      channel,
      payments: {
        showPurchaseEntryPoint: webPayments && mpesa,
        mpesa: webPayments && mpesa,
        stripe: webPayments && env.STRIPE_ENABLED === "true",
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
