import "server-only"

import { AccountType, EntityPlanInterval, EntityPlanType, EntityVerificationStatus, Prisma } from "@prisma/client"
import { env } from "@/lib/env"
import { ENTITY_PLAN_PRODUCTS } from "@/lib/google-play"
import { initializePaystackTransaction, resolvePaystackConfig } from "@/lib/paystack"
import { prisma } from "@/lib/prisma"

export type EntityPlanProductId = keyof typeof ENTITY_PLAN_PRODUCTS

const PLAN_USD: Record<EntityPlanProductId, number> = {
  entity_business_monthly: 35,
  entity_business_yearly: 390,
  entity_premium_monthly: 45,
  entity_premium_yearly: 510,
}

export async function initiateEntityPlanCheckout(userId: string, productId: EntityPlanProductId) {
  const gateway = await resolvePaystackConfig()
  if (!gateway.enabled) throw new Error("Web checkout is not available")
  const [user, settings] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { accountType: true, entityVerification: true, entityPublishedAt: true, email: true } }),
    prisma.appSettings.findUnique({ where: { id: 1 }, select: { usdToKesRate: true, transactionFeePercent: true } }),
  ])
  if (user?.accountType !== AccountType.ENTITY) throw new Error("Entity account required")
  if (user.entityVerification !== EntityVerificationStatus.APPROVED || !user.entityPublishedAt) {
    throw new Error("Your entity account must be verified before purchasing a plan")
  }
  const rate = Number(settings?.usdToKesRate) || 130
  const feePercent = Number(settings?.transactionFeePercent ?? 0)
  const subtotalKes = Math.round(PLAN_USD[productId] * rate)
  const totalKes = subtotalKes + Math.round(subtotalKes * feePercent / 100)
  const purchase = await prisma.creditPurchase.create({ data: {
    userId, phone: "", items: {} as Prisma.InputJsonValue, totalKes: new Prisma.Decimal(totalKes),
    provider: "PAYSTACK", status: "PENDING", exchangeRate: new Prisma.Decimal(rate),
    pricingSnapshot: { kind: "ENTITY_PLAN", productId, usd: PLAN_USD[productId], rate, feePercent } as Prisma.InputJsonValue,
  } })
  try {
    const base = (env.APP_URL || "").replace(/\/$/, "")
    if (!base) throw new Error("APP_URL is required for checkout")
    const email = user.email && user.email.includes("@") ? user.email : `user-${userId}@chatandtip.app`
    const { authorizationUrl } = await initializePaystackTransaction({
      reference: purchase.id,
      amountKes: totalKes,
      email,
      callbackUrl: `${base}/checkout?entityPlan=return&purchaseId=${purchase.id}`,
    })
    return { url: authorizationUrl, purchaseId: purchase.id }
  } catch (error) {
    await prisma.creditPurchase.update({ where: { id: purchase.id }, data: { status: "FAILED" } })
    throw error
  }
}

export async function fulfillEntityPlanPurchase(purchaseId: string) {
  const purchase = await prisma.creditPurchase.findUnique({ where: { id: purchaseId } })
  if (!purchase || purchase.allocated) return
  const snapshot = purchase.pricingSnapshot as { kind?: string; productId?: EntityPlanProductId } | null
  if (snapshot?.kind !== "ENTITY_PLAN" || !snapshot.productId || !ENTITY_PLAN_PRODUCTS[snapshot.productId]) return
  const plan = ENTITY_PLAN_PRODUCTS[snapshot.productId]
  const now = new Date()
  const expiry = new Date(now)
  if (plan.interval === "YEARLY") expiry.setUTCFullYear(expiry.getUTCFullYear() + 1)
  else expiry.setUTCMonth(expiry.getUTCMonth() + 1)
  await prisma.$transaction([
    prisma.user.update({ where: { id: purchase.userId }, data: {
      entityPlanType: plan.type as EntityPlanType,
      entityPlanInterval: plan.interval as EntityPlanInterval,
      entityPlanStartedAt: now,
      entityPlanExpiresAt: expiry,
    } }),
    prisma.creditPurchase.update({ where: { id: purchase.id }, data: { status: "SUCCESS", allocated: true } }),
  ])
}
