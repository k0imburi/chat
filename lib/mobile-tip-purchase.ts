import "server-only"

import { Prisma, TipTier } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { initiateStkPush } from "@/lib/mpesa"
import { TIP_USD } from "@/lib/mobile-credits"
import { newPaymentIdempotencyKey } from "@/lib/payment-attempts"
import { normalizePhone } from "@/lib/mpesa"

export async function initiateTipPurchase(input: { senderId: string; receiverId: string; tier: TipTier; phone: string }) {
  if (input.senderId === input.receiverId) throw new Error("You cannot tip yourself")
  const receiver = await prisma.user.findUnique({ where: { id: input.receiverId }, select: { id: true, fullName: true, earningSuspendedUntil: true } })
  if (!receiver) throw new Error("Creator not found")
  if (receiver.earningSuspendedUntil && receiver.earningSuspendedUntil > new Date()) throw new Error("Tips are temporarily unavailable for this creator")
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } })
  const rate = Number(settings?.usdToKesRate || 0)
  if (rate <= 0) throw new Error("USD to KES exchange rate is not configured")
  const amountUsd = TIP_USD[input.tier]
  const totalKes = Math.ceil(amountUsd * rate)
  const phone = normalizePhone(input.phone)
  const purchase = await prisma.$transaction(async (tx) => {
    const attempt = await tx.paymentAttempt.create({ data: {
      userId: input.senderId, provider: "MPESA", purpose: "TIP",
      amount: new Prisma.Decimal(totalKes), currency: "KES", expectedPhone: phone,
      idempotencyKey: newPaymentIdempotencyKey("TIP", input.senderId),
      metadata: { receiverId: input.receiverId, tier: input.tier, amountUsd, exchangeRate: rate },
    } })
    return tx.tipPurchase.create({ data: {
      senderId: input.senderId, receiverId: input.receiverId, tier: input.tier,
      amountUsd: new Prisma.Decimal(amountUsd), totalKes: new Prisma.Decimal(totalKes), exchangeRate: new Prisma.Decimal(rate),
      phone, status: "PENDING", provider: "MPESA", paymentAttemptId: attempt.id,
    } })
  })
  let stk: Awaited<ReturnType<typeof initiateStkPush>>
  try {
    stk = await initiateStkPush({
      phone, amount: totalKes, reference: purchase.id, description: `${input.tier} creator support`,
      userId: input.senderId, paymentAttemptId: purchase.paymentAttemptId!,
    })
  } catch (error) {
    await prisma.$transaction([
      prisma.tipPurchase.update({ where: { id: purchase.id }, data: { status: "FAILED" } }),
      prisma.paymentAttempt.update({ where: { id: purchase.paymentAttemptId! }, data: {
        status: "FAILED", failureReason: error instanceof Error ? error.message.slice(0, 1000) : "STK request failed",
      } }),
    ])
    throw error
  }
  await prisma.tipPurchase.update({ where: { id: purchase.id }, data: {
    checkoutRequestId: stk.checkoutRequestID || null, status: stk.success ? "PENDING" : "FAILED",
  } })
  return { success: stk.success, message: stk.message, purchaseId: purchase.id, totalKes, creatorName: receiver.fullName }
}
