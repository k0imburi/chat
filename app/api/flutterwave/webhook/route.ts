import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { allocateCredits, type CartItems } from "@/lib/mobile-credits"
import { resolveFlutterwaveConfig, verifyFlutterwaveSignature } from "@/lib/flutterwave"
import { logError } from "@/lib/log-error"

export async function POST(request: Request) {
  const cfg = await resolveFlutterwaveConfig()
  if (!cfg.enabled) return NextResponse.json({ received: false }, { status: 404 })

  const rawBody = await request.text()
  if (!verifyFlutterwaveSignature(rawBody, request.headers.get("flutterwave-signature"), cfg.secretHash)) {
    return NextResponse.json({ received: false }, { status: 400 })
  }

  try {
    const event = JSON.parse(rawBody) as {
      event?: string
      data?: { reference?: string; amount?: number; currency?: string; status?: string }
    }
    if (event.event !== "charge.completed") return NextResponse.json({ received: true })
    if (event.data?.status !== "succeeded") return NextResponse.json({ received: true })

    const reference = event.data?.reference || ""
    const purchase = await prisma.creditPurchase.findFirst({
      where: { id: reference, provider: "FLUTTERWAVE" },
    })
    if (!purchase) return NextResponse.json({ received: true })

    // Guard against tampering — the paid amount/currency must match what we
    // expect for this purchase before allocating anything.
    const expected = Math.round(Number(purchase.totalKes))
    if (event.data?.currency?.toUpperCase() !== cfg.currency.toUpperCase() || event.data?.amount !== expected) {
      return NextResponse.json({ received: true })
    }

    if (!purchase.allocated) {
      await allocateCredits({
        userId: purchase.userId,
        items: purchase.items as CartItems,
        transactionId: purchase.id,
      })
      await prisma.creditPurchase.update({
        where: { id: purchase.id },
        data: { status: "SUCCESS", allocated: true },
      })
    }
    return NextResponse.json({ received: true })
  } catch (error) {
    logError("/api/flutterwave/webhook", error)
    return NextResponse.json({ received: false }, { status: 400 })
  }
}
