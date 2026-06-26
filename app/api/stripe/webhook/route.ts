import { NextResponse } from "next/server"
import { constructStripeEvent } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import { allocateCredits, type CartItems } from "@/lib/mobile-credits"
import { logError } from "@/lib/log-error"
import { env } from "@/lib/env"

export async function POST(request: Request) {
  if (env.STRIPE_ENABLED !== "true") return NextResponse.json({ received: false }, { status: 404 })
  const rawBody = await request.text()
  try {
    const event = constructStripeEvent(rawBody, request.headers.get("stripe-signature"))
    if (!["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed"].includes(event.type)) {
      return NextResponse.json({ received: true })
    }
    const session = event.data.object
    const purchaseId = session.metadata?.purchaseId || session.client_reference_id || ""
    const purchase = await prisma.creditPurchase.findFirst({ where: {
      id: purchaseId, provider: "STRIPE", stripeSessionId: session.id,
    } })
    if (!purchase) return NextResponse.json({ received: true })
    if (event.type === "checkout.session.async_payment_failed") {
      await prisma.creditPurchase.update({ where: { id: purchase.id }, data: { status: "FAILED" } })
      return NextResponse.json({ received: true })
    }
    if (session.payment_status !== "paid") return NextResponse.json({ received: true })
    if (session.currency?.toLowerCase() !== "kes" || session.amount_total !== Math.round(Number(purchase.totalKes) * 100)) {
      throw new Error("Stripe amount or currency does not match the purchase")
    }
    if (!purchase.allocated) {
      await allocateCredits({ userId: purchase.userId, items: purchase.items as CartItems, transactionId: purchase.id })
      await prisma.creditPurchase.update({ where: { id: purchase.id }, data: { status: "SUCCESS", allocated: true } })
    }
    return NextResponse.json({ received: true })
  } catch (error) {
    logError("/api/stripe/webhook", error)
    return NextResponse.json({ received: false }, { status: 400 })
  }
}
