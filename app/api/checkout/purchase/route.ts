import { NextResponse } from "next/server"
import { z } from "zod"
import { CreditKind, TipTier } from "@prisma/client"
import { getCheckoutActorUserId } from "@/lib/checkout-auth"
import { initiateCreditPurchase, initiateStripeCreditPurchase, initiatePaystackCreditPurchase, initiateFlutterwaveCreditPurchase } from "@/lib/mobile-credit-purchase"
import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/log-error"
import { resolveStripeConfig } from "@/lib/stripe"
import { resolvePaystackConfig } from "@/lib/paystack"
import { resolveFlutterwaveConfig } from "@/lib/flutterwave"

const bodySchema = z.object({
  provider: z.enum(["MPESA", "STRIPE", "PAYSTACK", "FLUTTERWAVE"]).default("MPESA"),
  phone: z.string().optional().default(""),
  items: z.record(z.nativeEnum(CreditKind), z.number().int().nonnegative()).optional().default({}),
  tipItems: z.record(z.nativeEnum(TipTier), z.number().int().nonnegative()).optional().default({}),
})

// Start a credit purchase from the website. Authenticated by either the
// short-lived mobile checkout token cookie or the signed-in customer session.
export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json())
    const userId = await getCheckoutActorUserId(request)
    if (!userId) {
      return NextResponse.json({ success: false, message: "Sign in or open a fresh checkout link" }, { status: 401 })
    }
    if (body.provider === "STRIPE" && !(await resolveStripeConfig()).enabled) {
      return NextResponse.json({ success: false, message: "Card payments are not available" }, { status: 404 })
    }
    if (body.provider === "PAYSTACK" && !(await resolvePaystackConfig()).enabled) {
      return NextResponse.json({ success: false, message: "Card payments are not available" }, { status: 404 })
    }
    if (body.provider === "FLUTTERWAVE" && !(await resolveFlutterwaveConfig()).enabled) {
      return NextResponse.json({ success: false, message: "Google Pay is not available" }, { status: 404 })
    }
    if (body.provider === "MPESA" && body.phone.length < 6) {
      return NextResponse.json({ success: false, message: "Enter a valid M-PESA phone number" }, { status: 400 })
    }
    const result = body.provider === "STRIPE"
      ? await initiateStripeCreditPurchase({ userId, items: body.items, tipItems: body.tipItems })
      : body.provider === "PAYSTACK"
        ? await initiatePaystackCreditPurchase({ userId, items: body.items, tipItems: body.tipItems })
        : body.provider === "FLUTTERWAVE"
          ? await initiateFlutterwaveCreditPurchase({ userId, items: body.items, tipItems: body.tipItems })
          : await initiateCreditPurchase({ userId, phone: body.phone, items: body.items, tipItems: body.tipItems })
    return NextResponse.json({ success: result.success, data: result })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      )
    }
    logError("/api/checkout/purchase", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to start purchase" },
      { status: 500 },
    )
  }
}

// Poll a purchase's status so the page can confirm allocation after STK.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const purchaseId = url.searchParams.get("purchaseId") || ""
  const userId = await getCheckoutActorUserId(request)
  if (!userId) {
    return NextResponse.json({ success: false, message: "Sign in or open a fresh checkout link" }, { status: 401 })
  }
  if (!purchaseId) {
    return NextResponse.json({ success: false, message: "purchaseId is required" }, { status: 400 })
  }
  const purchase = await prisma.creditPurchase.findFirst({
    where: { id: purchaseId, userId },
    select: { id: true, status: true, allocated: true, totalKes: true, items: true },
  })
  if (!purchase) {
    return NextResponse.json({ success: false, message: "Purchase not found" }, { status: 404 })
  }
  return NextResponse.json({ success: true, data: purchase })
}
