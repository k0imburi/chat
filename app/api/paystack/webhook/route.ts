import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { allocateCredits, type CartItems } from "@/lib/mobile-credits"
import { resolvePaystackConfig, verifyPaystackSignature } from "@/lib/paystack"
import { logError } from "@/lib/log-error"

export async function POST(request: Request) {
  const cfg = await resolvePaystackConfig()
  if (!cfg.enabled) return NextResponse.json({ received: false }, { status: 404 })

  const rawBody = await request.text()
  if (!verifyPaystackSignature(rawBody, request.headers.get("x-paystack-signature"), cfg.secretKey)) {
    return NextResponse.json({ received: false }, { status: 400 })
  }

  try {
    const event = JSON.parse(rawBody) as {
      event?: string
      data?: { reference?: string; amount?: number; currency?: string; status?: string }
    }
    if (event.event !== "charge.success") return NextResponse.json({ received: true })

    const reference = event.data?.reference || ""
    const purchase = await prisma.creditPurchase.findFirst({
      where: { id: reference, provider: "PAYSTACK" },
    })
    if (!purchase) return NextResponse.json({ received: true })

    // Amount is in the KES subunit (cents); guard against tampering.
    const expected = Math.round(Number(purchase.totalKes) * 100)
    if (
      event.data?.status !== "success" ||
      event.data?.currency?.toUpperCase() !== "KES" ||
      event.data?.amount !== expected
    ) {
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
    logError("/api/paystack/webhook", error)
    return NextResponse.json({ received: false }, { status: 400 })
  }
}
