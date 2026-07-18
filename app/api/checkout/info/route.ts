import { NextResponse } from "next/server"
import { getCheckoutActorUserId } from "@/lib/checkout-auth"
import { findMobileUserById } from "@/lib/mobile-users"
import {
  getCreditBalances,
  purchasePriceKesFor,
  ON_ACCOUNT_VALUE_KES,
  MIN_PURCHASE,
  TIP_USD,
} from "@/lib/mobile-credits"
import { getTipWallet } from "@/lib/mobile-tip-wallet"
import { logError } from "@/lib/log-error"
import { resolveStripeConfig } from "@/lib/stripe"
import { resolvePaystackConfig } from "@/lib/paystack"
import { resolveFlutterwaveConfig } from "@/lib/flutterwave"
import { isMpesaConfigComplete, resolveMpesaConfig } from "@/lib/mpesa"
import { prisma } from "@/lib/prisma"
import { TipTier } from "@prisma/client"

// Context for the web checkout page: who the token belongs to, their current
// balances, and the pricing tables. Authenticated by the checkout token.
export async function GET(request: Request) {
  const userId = await getCheckoutActorUserId(request)
  if (!userId) {
    return NextResponse.json({ success: false, message: "Sign in or open a fresh checkout link" }, { status: 401 })
  }
  try {
    const [user, balances, tipWallet, mpesaConfig, settings] = await Promise.all([
      findMobileUserById(userId),
      getCreditBalances(userId),
      getTipWallet(userId),
      resolveMpesaConfig(),
      prisma.appSettings.findUnique({ where: { id: 1 }, select: { usdToKesRate: true, transactionFeePercent: true } }),
    ])
    // `||`, not `??` — a stored 0 (never configured) must fall back too, not
    // silently price everything at zero.
    const rate = Number(settings?.usdToKesRate) || 130
    const transactionFeePercent = Number(settings?.transactionFeePercent ?? 0)
    const tipPurchaseKes = Object.fromEntries(
      Object.values(TipTier).map((tier) => [tier, Math.round(TIP_USD[tier] * rate)])
    ) as Record<TipTier, number>

    return NextResponse.json({
      success: true,
      data: {
        user: user ? { fullName: user.fullName, phoneNumber: user.phoneNumber } : null,
        balances,
        tipBalances: { pebbles: tipWallet.pebbles, gems: tipWallet.gems, diamonds: tipWallet.diamonds },
        pricing: {
          purchaseKes: purchasePriceKesFor(rate),
          onAccountKes: ON_ACCOUNT_VALUE_KES,
          minPurchase: MIN_PURCHASE,
          tipPurchaseKes,
          usdToKesRate: rate,
          transactionFeePercent,
        },
        providers: {
          mpesa: isMpesaConfigComplete(mpesaConfig),
          stripe: (await resolveStripeConfig()).enabled,
          paystack: (await resolvePaystackConfig()).enabled,
          flutterwave: (await resolveFlutterwaveConfig()).enabled,
        },
      },
    })
  } catch (error) {
    logError("/api/checkout/info", error)
    return NextResponse.json({ success: false, message: "Failed to load checkout" }, { status: 500 })
  }
}
