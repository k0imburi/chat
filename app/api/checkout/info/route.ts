import { NextResponse } from "next/server"
import { getCheckoutActorUserId } from "@/lib/checkout-auth"
import { findMobileUserById } from "@/lib/mobile-users"
import {
  getCreditBalances,
  PURCHASE_PRICE_KES,
  ON_ACCOUNT_VALUE_KES,
  MIN_PURCHASE,
} from "@/lib/mobile-credits"
import { logError } from "@/lib/log-error"
import { env } from "@/lib/env"
import { isMpesaConfigComplete, resolveMpesaConfig } from "@/lib/mpesa"

// Context for the web checkout page: who the token belongs to, their current
// balances, and the pricing tables. Authenticated by the checkout token.
export async function GET(request: Request) {
  const userId = await getCheckoutActorUserId(request)
  if (!userId) {
    return NextResponse.json({ success: false, message: "Sign in or open a fresh checkout link" }, { status: 401 })
  }
  try {
    const [user, balances, mpesaConfig] = await Promise.all([
      findMobileUserById(userId),
      getCreditBalances(userId),
      resolveMpesaConfig(),
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
        providers: {
          mpesa: env.MPESA_ENABLED === "true" && isMpesaConfigComplete(mpesaConfig),
          stripe: env.STRIPE_ENABLED === "true",
        },
      },
    })
  } catch (error) {
    logError("/api/checkout/info", error)
    return NextResponse.json({ success: false, message: "Failed to load checkout" }, { status: 500 })
  }
}
