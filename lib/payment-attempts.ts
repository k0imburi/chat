import "server-only"

import { createHash, randomUUID } from "node:crypto"
import { PaymentPurpose, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { allocateCreditsInTransaction, recordTipInTransaction, type CartItems } from "@/lib/mobile-credits"
import { creditTipTokensInTransaction } from "@/lib/mobile-tip-wallet"

export function newPaymentIdempotencyKey(purpose: PaymentPurpose, userId: string) {
  return `${purpose.toLowerCase()}:${userId}:${randomUUID()}`
}

export function paymentPayloadHash(rawBody: string) {
  return createHash("sha256").update(rawBody, "utf8").digest("hex")
}

export async function fulfillVerifiedCreditAttempt(attemptId: string) {
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.paymentAttempt.findUnique({
      where: { id: attemptId },
      include: { creditPurchase: true },
    })
    if (!attempt || attempt.provider !== "MPESA" || attempt.purpose !== "CREDIT_PURCHASE") {
      throw new Error("Credit payment attempt not found")
    }
    if (attempt.status === "SUCCEEDED") return { fulfilled: false, purchaseId: attempt.creditPurchase?.id }
    if (attempt.status !== "VERIFYING" || !attempt.verifiedAt || !attempt.providerReceipt) {
      throw new Error("Payment attempt has not been verified")
    }
    const purchase = attempt.creditPurchase
    if (!purchase || Number(purchase.totalKes) !== Number(attempt.amount)) {
      throw new Error("Payment purchase does not match the verified attempt")
    }
    const claimed = await tx.paymentAttempt.updateMany({
      where: { id: attempt.id, status: "VERIFYING" },
      data: { status: "FULFILLING" },
    })
    if (!claimed.count) return { fulfilled: false, purchaseId: purchase.id }
    if (Object.values((purchase.items as CartItems) ?? {}).some((v) => (v ?? 0) > 0)) {
      await allocateCreditsInTransaction(tx, {
        userId: purchase.userId,
        items: purchase.items as CartItems,
        transactionId: purchase.id,
      })
    }
    const snapshot = purchase.pricingSnapshot as Record<string, unknown> | null
    const tipItems = snapshot?.tipItems as Partial<Record<string, number>> | undefined
    if (tipItems) {
      for (const [tier, qty] of Object.entries(tipItems)) {
        const n = Number(qty)
        if (!n || n <= 0) continue
        await creditTipTokensInTransaction(tx, purchase.userId, tier as import("@prisma/client").TipTier, n)
      }
    }
    await tx.creditPurchase.update({
      where: { id: purchase.id },
      data: { status: "SUCCESS", allocated: true },
    })
    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: "SUCCEEDED", fulfilledAt: new Date() },
    })
    return { fulfilled: true, purchaseId: purchase.id }
  }, { timeout: 20_000, maxWait: 10_000 })
}

export async function fulfillVerifiedTipAttempt(attemptId: string) {
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.paymentAttempt.findUnique({ where: { id: attemptId }, include: { tipPurchase: true } })
    if (!attempt || attempt.provider !== "MPESA" || attempt.purpose !== "TIP") throw new Error("Tip payment attempt not found")
    if (attempt.status === "SUCCEEDED") return { fulfilled: false, purchaseId: attempt.tipPurchase?.id }
    if (attempt.status !== "VERIFYING" || !attempt.verifiedAt || !attempt.providerReceipt) throw new Error("Payment attempt has not been verified")
    const purchase = attempt.tipPurchase
    if (!purchase || Number(purchase.totalKes) !== Number(attempt.amount)) throw new Error("Tip purchase does not match the verified attempt")
    const claimed = await tx.paymentAttempt.updateMany({ where: { id: attempt.id, status: "VERIFYING" }, data: { status: "FULFILLING" } })
    if (!claimed.count) return { fulfilled: false, purchaseId: purchase.id }
    if (purchase.receiverId) {
      await recordTipInTransaction(tx, {
        senderId: purchase.senderId, receiverId: purchase.receiverId, tier: purchase.tier,
        transactionId: purchase.id, exchangeRate: Number(purchase.exchangeRate),
      })
    } else {
      await creditTipTokensInTransaction(tx, purchase.senderId, purchase.tier, purchase.qty)
    }
    await tx.tipPurchase.update({ where: { id: purchase.id }, data: { status: "SUCCESS", recorded: true } })
    await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: "SUCCEEDED", fulfilledAt: new Date() } })
    return { fulfilled: true, purchaseId: purchase.id }
  }, { timeout: 20_000, maxWait: 10_000 })
}

export async function markAttemptFailed(attemptId: string, reason: string, resultCode?: number) {
  await prisma.$transaction(async (tx) => {
    const attempt = await tx.paymentAttempt.findUnique({ where: { id: attemptId }, include: { creditPurchase: true, tipPurchase: true } })
    if (!attempt || ["SUCCEEDED", "FULFILLING"].includes(attempt.status)) return
    const status = resultCode === 1032 ? "CANCELLED" : "FAILED"
    await tx.paymentAttempt.update({ where: { id: attemptId }, data: {
      status, resultCode, failureReason: reason.slice(0, 1000), callbackReceivedAt: new Date(),
    } })
    if (attempt.creditPurchase) await tx.creditPurchase.update({ where: { id: attempt.creditPurchase.id }, data: { status } })
    if (attempt.tipPurchase) await tx.tipPurchase.update({ where: { id: attempt.tipPurchase.id }, data: { status } })
  })
}

export function paymentMetadata(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}
