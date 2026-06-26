import { NextResponse } from "next/server"
import { z } from "zod"
import { CreditKind } from "@prisma/client"
import { readCheckoutToken } from "@/lib/mobile-session"
import { initiateCreditPurchase } from "@/lib/mobile-credit-purchase"
import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/log-error"

const bodySchema = z.object({
  token: z.string().min(1),
  phone: z.string().min(6),
  items: z.record(z.nativeEnum(CreditKind), z.number().int().positive()),
})

// Start a credit purchase from the website. Authenticated by the checkout token.
export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json())
    const userId = await readCheckoutToken(body.token)
    if (!userId) {
      return NextResponse.json({ success: false, message: "Invalid or expired link" }, { status: 401 })
    }
    const result = await initiateCreditPurchase({
      userId,
      phone: body.phone,
      items: body.items,
    })
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
  const token = url.searchParams.get("t") || ""
  const purchaseId = url.searchParams.get("purchaseId") || ""
  const userId = await readCheckoutToken(token)
  if (!userId) {
    return NextResponse.json({ success: false, message: "Invalid or expired link" }, { status: 401 })
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
