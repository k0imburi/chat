import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { initiateStkPush } from "@/lib/mpesa"
import { ON_ACCOUNT_VALUE_KES, PURCHASE_PRICE_KES, priceCart, type CartItems } from "@/lib/mobile-credits"
import { createStripeCheckoutSession } from "@/lib/stripe"
import { env } from "@/lib/env"
import { newPaymentIdempotencyKey } from "@/lib/payment-attempts"
import { normalizePhone } from "@/lib/mpesa"

/**
 * Start a credit purchase: validate the cart, initiate an MPESA STK push for
 * the total, and record a CreditPurchase linked to the checkout id. Credits
 * are NOT allocated here — only after the STK callback confirms payment (see
 * verified PaymentAttempt fulfillment in lib/payment-attempts).
 */
export async function initiateCreditPurchase(input: {
  userId: string
  phone: string
  items: CartItems
}) {
  const { totalKes, normalized } = priceCart(input.items)
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 }, select: { usdToKesRate: true } })

  const normalizedPhone = normalizePhone(input.phone)
  const purchase = await prisma.$transaction(async (tx) => {
    const attempt = await tx.paymentAttempt.create({ data: {
      userId: input.userId, provider: "MPESA", purpose: "CREDIT_PURCHASE",
      amount: new Prisma.Decimal(totalKes), currency: "KES", expectedPhone: normalizedPhone,
      idempotencyKey: newPaymentIdempotencyKey("CREDIT_PURCHASE", input.userId),
      metadata: { pricingSnapshot: { purchaseKes: PURCHASE_PRICE_KES, creatorValueKes: ON_ACCOUNT_VALUE_KES }, items: normalized } as Prisma.InputJsonValue,
    } })
    return tx.creditPurchase.create({ data: {
      userId: input.userId, phone: normalizedPhone, items: normalized as Prisma.InputJsonValue,
      totalKes: new Prisma.Decimal(totalKes), status: "PENDING", provider: "MPESA",
      paymentAttemptId: attempt.id, exchangeRate: settings?.usdToKesRate || null,
      pricingSnapshot: { purchaseKes: PURCHASE_PRICE_KES, creatorValueKes: ON_ACCOUNT_VALUE_KES } as Prisma.InputJsonValue,
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

export async function initiateStripeCreditPurchase(input: { userId: string; items: CartItems }) {
  const { totalKes, normalized } = priceCart(input.items)
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 }, select: { usdToKesRate: true } })
  const purchase = await prisma.creditPurchase.create({ data: {
    userId: input.userId, phone: "", items: normalized as Prisma.InputJsonValue,
    totalKes: new Prisma.Decimal(totalKes), provider: "STRIPE", status: "PENDING",
    exchangeRate: settings?.usdToKesRate || null,
    pricingSnapshot: { purchaseKes: PURCHASE_PRICE_KES, creatorValueKes: ON_ACCOUNT_VALUE_KES } as Prisma.InputJsonValue,
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
