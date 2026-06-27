import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import {
  getCreditBalances,
  PURCHASE_PRICE_KES,
  ON_ACCOUNT_VALUE_KES,
  TIP_USD,
} from "@/lib/mobile-credits"
import { getTipWallet } from "@/lib/mobile-tip-wallet"
import { logError } from "@/lib/log-error"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }
  try {
    const [balances, tipWallet] = await Promise.all([
      getCreditBalances(session.userId),
      getTipWallet(session.userId),
    ])
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
          purchaseKes: PURCHASE_PRICE_KES,
          onAccountKes: ON_ACCOUNT_VALUE_KES,
          tipUsd: TIP_USD,
        },
      },
    })
  } catch (error) {
    logError("/api/mobile/credits", error)
    return NextResponse.json({ success: false, message: "Failed to load credits" }, { status: 500 })
  }
}
