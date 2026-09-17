import { NextResponse } from "next/server"
import { AccountType, EntityPlanInterval, EntityPlanType, EntityVerificationStatus, Prisma } from "@prisma/client"
import { z } from "zod"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { ENTITY_PLAN_PRODUCTS, getAndroidSubscriptionPurchase, resolveGooglePlayConfig } from "@/lib/google-play"
import { prisma } from "@/lib/prisma"

const schema = z.object({
  productId: z.enum(["entity_business_monthly", "entity_business_yearly", "entity_premium_monthly", "entity_premium_yearly"]),
  purchaseToken: z.string().min(1),
})

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  try {
    if (!(await resolveGooglePlayConfig()).enabled) {
      return NextResponse.json({ success: false, message: "Google Play subscriptions are not available" }, { status: 404 })
    }
    const body = schema.parse(await request.json())
    const account = await prisma.user.findUnique({ where: { id: session.userId }, select: {
      accountType: true, entityVerification: true, entityPublishedAt: true,
    } })
    if (account?.accountType !== AccountType.ENTITY) return NextResponse.json({ success: false, message: "Entity account required" }, { status: 403 })
    if (account.entityVerification !== EntityVerificationStatus.APPROVED || !account.entityPublishedAt) {
      return NextResponse.json({ success: false, message: "Your entity account must be verified before purchasing a plan" }, { status: 403 })
    }
    const subscription = await getAndroidSubscriptionPurchase(body.productId, body.purchaseToken)
    if (subscription.paymentState !== 1 || !subscription.expiryTimeMillis) {
      return NextResponse.json({ success: false, message: "Subscription payment is not complete" }, { status: 400 })
    }
    const expiry = new Date(Number(subscription.expiryTimeMillis))
    if (!Number.isFinite(expiry.getTime()) || expiry <= new Date()) {
      return NextResponse.json({ success: false, message: "Subscription is expired" }, { status: 400 })
    }
    const plan = ENTITY_PLAN_PRODUCTS[body.productId]
    const existing = await prisma.creditPurchase.findUnique({ where: { googlePlayPurchaseToken: body.purchaseToken } })
    if (existing && existing.userId !== session.userId) return NextResponse.json({ success: false, message: "This purchase belongs to another account" }, { status: 409 })
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: session.userId }, data: {
        entityPlanType: plan.type as EntityPlanType,
        entityPlanInterval: plan.interval as EntityPlanInterval,
        entityPlanStartedAt: new Date(),
        entityPlanExpiresAt: expiry,
      } })
      const snapshot = { productId: body.productId, orderId: subscription.orderId ?? null, kind: "ENTITY_PLAN" } as Prisma.InputJsonValue
      if (existing) {
        await tx.creditPurchase.update({ where: { id: existing.id }, data: { status: "SUCCESS", allocated: true, pricingSnapshot: snapshot } })
      } else {
        await tx.creditPurchase.create({ data: {
          userId: session.userId, phone: "", items: {} as Prisma.InputJsonValue, totalKes: new Prisma.Decimal(0), provider: "GOOGLE_PLAY", status: "SUCCESS", allocated: true,
          googlePlayPurchaseToken: body.purchaseToken, pricingSnapshot: snapshot,
        } })
      }
    })
    return NextResponse.json({ success: true, data: { expiresAt: expiry.toISOString(), plan } })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message ?? "Invalid request" : error instanceof Error ? error.message : "Could not activate plan"
    return NextResponse.json({ success: false, message }, { status: 400 })
  }
}
