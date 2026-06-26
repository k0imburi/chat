import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import {
  getCreditBalances,
  PURCHASE_PRICE_KES,
  ON_ACCOUNT_VALUE_KES,
  TIP_USD,
} from "@/lib/mobile-credits"
import { logError } from "@/lib/log-error"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }
  try {
    const balances = await getCreditBalances(session.userId)
    return NextResponse.json({
      success: true,
      data: {
        balances,
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
