import { Prisma, TipTier } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { initiateStkPush } from "@/lib/mpesa"
import { ON_ACCOUNT_VALUE_KES, TIP_USD, priceCart, purchasePriceKesFor, type CartItems } from "@/lib/mobile-credits"
import { createStripeCheckoutSession } from "@/lib/stripe"
import { initializePaystackTransaction } from "@/lib/paystack"
import { initializeFlutterwaveGooglePayTransaction } from "@/lib/flutterwave"
import { env } from "@/lib/env"
import { newPaymentIdempotencyKey } from "@/lib/payment-attempts"
import { normalizePhone } from "@/lib/mpesa"

export type TipCartItems = Partial<Record<TipTier, number>>

function priceTipCart(tipItems: TipCartItems, usdToKesRate: number): { totalKes: number; normalized: TipCartItems } {
  const normalized: TipCartItems = {}
  let total = 0
  for (const [k, qty] of Object.entries(tipItems)) {
    const tier = k as TipTier
    const n = Math.floor(Number(qty) || 0)
    if (n <= 0) continue
    normalized[tier] = n
    total += Math.round(TIP_USD[tier] * usdToKesRate) * n
  }
  return { totalKes: total, normalized }
}

/**
 * Start a credit purchase: validate the cart, initiate an MPESA STK push for
 * the total, and record a CreditPurchase linked to the checkout id. Credits
 * are NOT allocated here — only after the STK callback confirms payment (see
 * verified PaymentAttempt fulfillment in lib/payment-attempts).
 * If tipItems is also provided, their KES value is added to the total and
 * they are stored in pricingSnapshot for fulfillment.
 */
export async function initiateCreditPurchase(input: {
  userId: string
  phone: string
  items: CartItems
  tipItems?: TipCartItems
}) {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 }, select: { usdToKesRate: true, transactionFeePercent: true } })
  // `||`, not `??` — a stored 0 (never configured) must fall back too, not
  // silently price everything at zero.
  const rate = Number(settings?.usdToKesRate) || 130
  const feePercent = Number(settings?.transactionFeePercent ?? 0)

  const hasCreditItems = Object.values(input.items).some((v) => (v ?? 0) > 0)
  const hasTipItems = Object.values(input.tipItems ?? {}).some((v) => (v ?? 0) > 0)

  let creditTotal = 0
  let normalizedCredits: CartItems = {}
  if (hasCreditItems) {
    const r = priceCart(input.items, rate)
    creditTotal = r.totalKes
    normalizedCredits = r.normalized
  }

  const { totalKes: tipTotal, normalized: normalizedTips } = priceTipCart(input.tipItems ?? {}, rate)

  const subtotal = creditTotal + tipTotal
  if (subtotal <= 0) throw new Error("Cart is empty")
  const feeKes = feePercent > 0 ? Math.round(subtotal * feePercent / 100) : 0
  const totalKes = subtotal + feeKes

  const tipPriceKes = Object.fromEntries(
    Object.values(TipTier).map((t) => [t, Math.round(TIP_USD[t] * rate)])
  ) as Record<TipTier, number>

  const normalizedPhone = normalizePhone(input.phone)
  const purchase = await prisma.$transaction(async (tx) => {
    const attempt = await tx.paymentAttempt.create({ data: {
      userId: input.userId, provider: "MPESA", purpose: "CREDIT_PURCHASE",
      amount: new Prisma.Decimal(totalKes), currency: "KES", expectedPhone: normalizedPhone,
      idempotencyKey: newPaymentIdempotencyKey("CREDIT_PURCHASE", input.userId),
      metadata: { items: normalizedCredits, tipItems: normalizedTips } as Prisma.InputJsonValue,
    } })
    return tx.creditPurchase.create({ data: {
      userId: input.userId, phone: normalizedPhone, items: normalizedCredits as Prisma.InputJsonValue,
      totalKes: new Prisma.Decimal(totalKes), status: "PENDING", provider: "MPESA",
      paymentAttemptId: attempt.id, exchangeRate: settings?.usdToKesRate || null,
      pricingSnapshot: {
        purchaseKes: purchasePriceKesFor(rate), creatorValueKes: ON_ACCOUNT_VALUE_KES,
        tipItems: normalizedTips, tipPriceKes, usdToKesRate: rate,
        feePercent, feeKes,
      } as Prisma.InputJsonValue,
    } })
  })

  let stk: Awaited<ReturnType<typeof initiateStkPush>>
  try {
    stk = await initiateStkPush({
      phone: normalizedPhone, amount: totalKes, reference: purchase.id,
      description: "ChatAndTip credit purchase", userId: input.userId,
      paymentAttemptId: purchase.paymentAttemptId!,
    })
  } catch (error) {
    await prisma.$transaction([
      prisma.creditPurchase.update({ where: { id: purchase.id }, data: { status: "FAILED" } }),
      prisma.paymentAttempt.update({ where: { id: purchase.paymentAttemptId! }, data: {
        status: "FAILED", failureReason: error instanceof Error ? error.message.slice(0, 1000) : "STK request failed",
      } }),
    ])
    throw error
  }

  await prisma.creditPurchase.update({
    where: { id: purchase.id },
    data: { checkoutRequestId: stk.checkoutRequestID || null, status: stk.success ? "PENDING" : "FAILED" },
  })

  return {
    success: stk.success,
    message: stk.message,
    purchaseId: purchase.id,
    checkoutRequestId: stk.checkoutRequestID || "",
    totalKes,
  }
}

export async function initiateStripeCreditPurchase(input: {
  userId: string
  items: CartItems
  tipItems?: TipCartItems
}) {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 }, select: { usdToKesRate: true, transactionFeePercent: true } })
  // `||`, not `??` — a stored 0 (never configured) must fall back too, not
  // silently price everything at zero.
  const rate = Number(settings?.usdToKesRate) || 130
  const feePercent = Number(settings?.transactionFeePercent ?? 0)

  const hasCreditItems = Object.values(input.items).some((v) => (v ?? 0) > 0)
  let creditTotal = 0
  let normalizedCredits: CartItems = {}
  if (hasCreditItems) {
    const r = priceCart(input.items, rate)
    creditTotal = r.totalKes
    normalizedCredits = r.normalized
  }

  const { totalKes: tipTotal, normalized: normalizedTips } = priceTipCart(input.tipItems ?? {}, rate)
  const subtotal = creditTotal + tipTotal
  if (subtotal <= 0) throw new Error("Cart is empty")
  const feeKes = feePercent > 0 ? Math.round(subtotal * feePercent / 100) : 0
  const totalKes = subtotal + feeKes

  const tipPriceKes = Object.fromEntries(
    Object.values(TipTier).map((t) => [t, Math.round(TIP_USD[t] * rate)])
  ) as Record<TipTier, number>

  const purchase = await prisma.creditPurchase.create({ data: {
    userId: input.userId, phone: "", items: normalizedCredits as Prisma.InputJsonValue,
    totalKes: new Prisma.Decimal(totalKes), provider: "STRIPE", status: "PENDING",
    exchangeRate: settings?.usdToKesRate || null,
    pricingSnapshot: {
      purchaseKes: purchasePriceKesFor(rate), creatorValueKes: ON_ACCOUNT_VALUE_KES,
      tipItems: normalizedTips, tipPriceKes, usdToKesRate: rate,
      feePercent, feeKes,
    } as Prisma.InputJsonValue,
  } })
  try {
    const base = (env.APP_URL || "").replace(/\/$/, "")
    if (!base) throw new Error("APP_URL is required for Stripe return URLs")
    const session = await createStripeCheckoutSession({
      purchaseId: purchase.id, userId: input.userId, amountKes: totalKes,
      description: "ChatAndTip credit recharge",
      successUrl: `${base}/checkout?stripe=success&purchaseId=${purchase.id}`,
      cancelUrl: `${base}/checkout?stripe=cancelled&purchaseId=${purchase.id}`,
    })
    await prisma.creditPurchase.update({ where: { id: purchase.id }, data: { stripeSessionId: session.id } })
    return { success: true, purchaseId: purchase.id, totalKes, redirectUrl: session.url }
  } catch (error) {
    await prisma.creditPurchase.update({ where: { id: purchase.id }, data: { status: "FAILED" } })
    throw error
  }
}

export async function initiatePaystackCreditPurchase(input: {
  userId: string
  items: CartItems
  tipItems?: TipCartItems
}) {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 }, select: { usdToKesRate: true, transactionFeePercent: true } })
  // `||`, not `??` — a stored 0 (never configured) must fall back too, not
  // silently price everything at zero.
  const rate = Number(settings?.usdToKesRate) || 130
  const feePercent = Number(settings?.transactionFeePercent ?? 0)

  const hasCreditItems = Object.values(input.items).some((v) => (v ?? 0) > 0)
  let creditTotal = 0
  let normalizedCredits: CartItems = {}
  if (hasCreditItems) {
    const r = priceCart(input.items, rate)
    creditTotal = r.totalKes
    normalizedCredits = r.normalized
  }

  const { totalKes: tipTotal, normalized: normalizedTips } = priceTipCart(input.tipItems ?? {}, rate)
  const subtotal = creditTotal + tipTotal
  if (subtotal <= 0) throw new Error("Cart is empty")
  const feeKes = feePercent > 0 ? Math.round(subtotal * feePercent / 100) : 0
  const totalKes = subtotal + feeKes

  const tipPriceKes = Object.fromEntries(
    Object.values(TipTier).map((t) => [t, Math.round(TIP_USD[t] * rate)])
  ) as Record<TipTier, number>

  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } })
  // Paystack requires an email; fall back to a deterministic placeholder.
  const email = user?.email && user.email.includes("@") ? user.email : `user-${input.userId}@chatandtip.app`

  const purchase = await prisma.creditPurchase.create({ data: {
    userId: input.userId, phone: "", items: normalizedCredits as Prisma.InputJsonValue,
    totalKes: new Prisma.Decimal(totalKes), provider: "PAYSTACK", status: "PENDING",
    exchangeRate: settings?.usdToKesRate || null,
    pricingSnapshot: {
      purchaseKes: purchasePriceKesFor(rate), creatorValueKes: ON_ACCOUNT_VALUE_KES,
      tipItems: normalizedTips, tipPriceKes, usdToKesRate: rate,
      feePercent, feeKes,
    } as Prisma.InputJsonValue,
  } })
  try {
    const base = (env.APP_URL || "").replace(/\/$/, "")
    if (!base) throw new Error("APP_URL is required for Paystack return URLs")
    const { authorizationUrl } = await initializePaystackTransaction({
      reference: purchase.id,
      amountKes: totalKes,
      email,
      callbackUrl: `${base}/checkout?paystack=return&purchaseId=${purchase.id}`,
    })
    return { success: true, purchaseId: purchase.id, totalKes, redirectUrl: authorizationUrl }
  } catch (error) {
    await prisma.creditPurchase.update({ where: { id: purchase.id }, data: { status: "FAILED" } })
    throw error
  }
}

// Google Pay only — Flutterwave doesn't touch card/M-PESA in this app, since
// Paystack already handles those. Same shape as initiatePaystackCreditPurchase.
export async function initiateFlutterwaveCreditPurchase(input: {
  userId: string
  items: CartItems
  tipItems?: TipCartItems
}) {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 }, select: { usdToKesRate: true, transactionFeePercent: true } })
  // `||`, not `??` — a stored 0 (never configured) must fall back too, not
  // silently price everything at zero.
  const rate = Number(settings?.usdToKesRate) || 130
  const feePercent = Number(settings?.transactionFeePercent ?? 0)

  const hasCreditItems = Object.values(input.items).some((v) => (v ?? 0) > 0)
  let creditTotal = 0
  let normalizedCredits: CartItems = {}
  if (hasCreditItems) {
    const r = priceCart(input.items, rate)
    creditTotal = r.totalKes
    normalizedCredits = r.normalized
  }

  const { totalKes: tipTotal, normalized: normalizedTips } = priceTipCart(input.tipItems ?? {}, rate)
  const subtotal = creditTotal + tipTotal
  if (subtotal <= 0) throw new Error("Cart is empty")
  const feeKes = feePercent > 0 ? Math.round(subtotal * feePercent / 100) : 0
  const totalKes = subtotal + feeKes

  const tipPriceKes = Object.fromEntries(
    Object.values(TipTier).map((t) => [t, Math.round(TIP_USD[t] * rate)])
  ) as Record<TipTier, number>

  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } })
  // Flutterwave requires an email; fall back to a deterministic placeholder.
  const email = user?.email && user.email.includes("@") ? user.email : `user-${input.userId}@chatandtip.app`

  const purchase = await prisma.creditPurchase.create({ data: {
    userId: input.userId, phone: "", items: normalizedCredits as Prisma.InputJsonValue,
    totalKes: new Prisma.Decimal(totalKes), provider: "FLUTTERWAVE", status: "PENDING",
    exchangeRate: settings?.usdToKesRate || null,
    pricingSnapshot: {
      purchaseKes: purchasePriceKesFor(rate), creatorValueKes: ON_ACCOUNT_VALUE_KES,
      tipItems: normalizedTips, tipPriceKes, usdToKesRate: rate,
      feePercent, feeKes,
    } as Prisma.InputJsonValue,
  } })
  try {
    const base = (env.APP_URL || "").replace(/\/$/, "")
    if (!base) throw new Error("APP_URL is required for Flutterwave return URLs")
    const { authorizationUrl } = await initializeFlutterwaveGooglePayTransaction({
      reference: purchase.id,
      amountKes: totalKes,
      email,
      redirectUrl: `${base}/checkout?flutterwave=return&purchaseId=${purchase.id}`,
    })
    return { success: true, purchaseId: purchase.id, totalKes, redirectUrl: authorizationUrl }
  } catch (error) {
    await prisma.creditPurchase.update({ where: { id: purchase.id }, data: { status: "FAILED" } })
    throw error
  }
}
