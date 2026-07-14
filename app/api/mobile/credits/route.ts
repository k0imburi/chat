import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import {
  getCreditBalances,
  purchasePriceKesFor,
  PURCHASE_PRICE_USD,
  ON_ACCOUNT_VALUE_KES,
  TIP_USD,
} from "@/lib/mobile-credits"
import { getTipWallet } from "@/lib/mobile-tip-wallet"
import { logError } from "@/lib/log-error"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }
  try {
    const [balances, tipWallet, settings] = await Promise.all([
      getCreditBalances(session.userId),
      getTipWallet(session.userId),
      prisma.appSettings.findUnique({ where: { id: 1 }, select: { usdToKesRate: true } }),
    ])
    const rate = Number(settings?.usdToKesRate ?? 130)
    return NextResponse.json({
      success: true,
      data: {
        balances: {
          keys: balances.keys,
          chatCredits: balances.chatCredits,
          voiceSessions: balances.voiceSessions,
          videoSessions: balances.videoSessions,
          pebbles: tipWallet.pebbles,
          gems: tipWallet.gems,
          diamonds: tipWallet.diamonds,
        },
        pricing: {
          purchaseUsd: PURCHASE_PRICE_USD,
          purchaseKes: purchasePriceKesFor(rate),
          onAccountKes: ON_ACCOUNT_VALUE_KES,
          tipUsd: TIP_USD,
          usdToKesRate: rate,
        },
      },
    })
  } catch (error) {
    logError("/api/mobile/credits", error)
    return NextResponse.json({ success: false, message: "Failed to load credits" }, { status: 500 })
  }
}
