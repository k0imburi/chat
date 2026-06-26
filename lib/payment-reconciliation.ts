import "server-only"

import { prisma } from "@/lib/prisma"
import { queryStkPush } from "@/lib/mpesa"
import { fulfillVerifiedCreditAttempt, fulfillVerifiedTipAttempt } from "@/lib/payment-attempts"

export async function reconcileMpesaAttempts(limit = 50) {
  const attempts = await prisma.paymentAttempt.findMany({
    where: {
      provider: "MPESA", status: "VERIFYING", verifiedAt: null,
      checkoutRequestId: { not: null }, providerReceipt: { not: null },
    },
    orderBy: { callbackReceivedAt: "asc" },
    take: Math.min(100, Math.max(1, limit)),
  })
  const results: Array<{ id: string; status: string }> = []
  for (const attempt of attempts) {
    try {
      const verification = await queryStkPush(attempt.checkoutRequestId!)
      if (!verification.confirmed) {
        if (!verification.definitive) {
          results.push({ id: attempt.id, status: "VERIFYING" })
          continue
        }
        await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: {
          status: "REQUIRES_REVIEW", failureReason: verification.description,
        } })
        results.push({ id: attempt.id, status: "REQUIRES_REVIEW" })
        continue
      }
      await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { verifiedAt: new Date(), failureReason: null } })
      if (attempt.purpose === "CREDIT_PURCHASE") await fulfillVerifiedCreditAttempt(attempt.id)
      else if (attempt.purpose === "TIP") await fulfillVerifiedTipAttempt(attempt.id)
      else throw new Error("Unsupported reconciliation purpose")
      await prisma.mpesaPaymentRequest.updateMany({ where: { checkoutRequestId: attempt.checkoutRequestId }, data: { status: "SUCCESS" } })
      results.push({ id: attempt.id, status: "SUCCEEDED" })
    } catch {
      results.push({ id: attempt.id, status: "VERIFYING" })
    }
  }
  return results
}
