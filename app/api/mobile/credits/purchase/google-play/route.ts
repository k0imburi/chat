import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import {
  getAndroidPurchase,
  consumeAndroidPurchase,
  resolveGooglePlayConfig,
  PRODUCT_TO_CREDIT_KIND,
  PRODUCT_TO_TIP_TIER,
} from "@/lib/google-play"
import { allocateCredits, purchasePriceKesFor, TIP_USD } from "@/lib/mobile-credits"
import { creditTipTokensInTransaction } from "@/lib/mobile-tip-wallet"
import { logError } from "@/lib/log-error"

const bodySchema = z.object({
  productId: z.string().min(1),
  purchaseToken: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(999).default(1),
})

// Android-only Google Play Billing purchases. Unlike Paystack/Flutterwave,
// there's no webhook here — the client reports a purchase token right after
// Play Billing completes, and we verify it server-side via the Android
// Publisher API before granting anything (never trust the client's own
// "it succeeded" claim).
export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }
  if (!(await resolveGooglePlayConfig()).enabled) {
    return NextResponse.json({ success: false, message: "Google Play purchases are not available" }, { status: 404 })
  }

  try {
    const body = bodySchema.parse(await request.json())

    // Idempotent — a client retry after a dropped response must not
    // double-credit the same purchase token.
    const existing = await prisma.creditPurchase.findUnique({
      where: { googlePlayPurchaseToken: body.purchaseToken },
    })
    if (existing) {
      return NextResponse.json({ success: true, data: { purchaseId: existing.id, alreadyProcessed: true } })
    }

    const creditKind = PRODUCT_TO_CREDIT_KIND[body.productId]
    const tipTier = PRODUCT_TO_TIP_TIER[body.productId]
    if (!creditKind && !tipTier) {
      return NextResponse.json({ success: false, message: "Unknown product" }, { status: 400 })
    }

    const purchase = await getAndroidPurchase(body.productId, body.purchaseToken)
    if (purchase.purchaseState !== 0) {
      return NextResponse.json({ success: false, message: "Purchase not completed" }, { status: 400 })
    }

    const settings = await prisma.appSettings.findUnique({ where: { id: 1 }, select: { usdToKesRate: true } })
    const rate = Number(settings?.usdToKesRate) || 130
    // Same per-unit KES pricing checkout already uses — no second price table.
    const priceKes = creditKind ? purchasePriceKesFor(rate)[creditKind] : Math.round(TIP_USD[tipTier!] * rate)
    const totalKes = priceKes * body.quantity

    const purchaseRow = await prisma.creditPurchase.create({
      data: {
        userId: session.userId,
        phone: "",
        provider: "GOOGLE_PLAY",
        status: "PENDING",
        googlePlayPurchaseToken: body.purchaseToken,
        items: (creditKind ? { [creditKind]: body.quantity } : {}) as Prisma.InputJsonValue,
        totalKes: new Prisma.Decimal(totalKes),
        exchangeRate: rate,
        pricingSnapshot: {
          productId: body.productId,
          quantity: body.quantity,
          orderId: purchase.orderId ?? null,
        } as Prisma.InputJsonValue,
      },
    })

    if (creditKind) {
      await allocateCredits({ userId: session.userId, items: { [creditKind]: body.quantity }, transactionId: purchaseRow.id })
    } else if (tipTier) {
      await prisma.$transaction((tx) => creditTipTokensInTransaction(tx, session.userId, tipTier, body.quantity))
    }

    await prisma.creditPurchase.update({ where: { id: purchaseRow.id }, data: { status: "SUCCESS", allocated: true } })

    // Consume last, and don't fail the request if this errors — credits are
    // already granted at this point; a failed consume just means the item
    // can't be repurchased until it's retried, not a lost purchase.
    try {
      await consumeAndroidPurchase(body.productId, body.purchaseToken)
    } catch (error) {
      logError("/api/mobile/credits/purchase/google-play:consume", error)
    }

    return NextResponse.json({ success: true, data: { purchaseId: purchaseRow.id } })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      )
    }
    logError("/api/mobile/credits/purchase/google-play", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Purchase verification failed" },
      { status: 500 },
    )
  }
}
