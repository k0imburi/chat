import { NextResponse } from "next/server"
import { readCheckoutToken } from "@/lib/mobile-session"
import { findMobileUserById } from "@/lib/mobile-users"
import {
  getCreditBalances,
  PURCHASE_PRICE_KES,
  ON_ACCOUNT_VALUE_KES,
  MIN_PURCHASE,
} from "@/lib/mobile-credits"
import { logError } from "@/lib/log-error"

// Context for the web checkout page: who the token belongs to, their current
// balances, and the pricing tables. Authenticated by the checkout token.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") || ""
  const userId = await readCheckoutToken(token)
  if (!userId) {
    return NextResponse.json({ success: false, message: "Invalid or expired link" }, { status: 401 })
  }
  try {
    const [user, balances] = await Promise.all([
      findMobileUserById(userId),
      getCreditBalances(userId),
    ])
    return NextResponse.json({
      success: true,
      data: {
        user: user ? { fullName: user.fullName, phoneNumber: user.phoneNumber } : null,
        balances,
        pricing: {
          purchaseKes: PURCHASE_PRICE_KES,
          onAccountKes: ON_ACCOUNT_VALUE_KES,
          minPurchase: MIN_PURCHASE,
        },
      },
    })
  } catch (error) {
    logError("/api/checkout/info", error)
    return NextResponse.json({ success: false, message: "Failed to load checkout" }, { status: 500 })
  }
}
