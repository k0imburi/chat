import { NextResponse } from "next/server"
import { z } from "zod"
import { CreditKind } from "@prisma/client"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { initiateCreditPurchase } from "@/lib/mobile-credit-purchase"
import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/log-error"

const bodySchema = z.object({
  phone: z.string().min(6),
  items: z.record(z.nativeEnum(CreditKind), z.number().int().positive()),
})

// Start a credit purchase (MPESA STK). Credits are allocated by the STK
// callback once payment is confirmed.
export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }
  try {
    const body = bodySchema.parse(await request.json())
    const result = await initiateCreditPurchase({
      userId: session.userId,
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
    logError("/api/mobile/credits/purchase", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to start purchase" },
      { status: 500 },
    )
  }
}

// Poll a purchase's status (so the app can confirm allocation after STK).
export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }
  const purchaseId = new URL(request.url).searchParams.get("purchaseId")
  if (!purchaseId) {
    return NextResponse.json({ success: false, message: "purchaseId is required" }, { status: 400 })
  }
  const purchase = await prisma.creditPurchase.findFirst({
    where: { id: purchaseId, userId: session.userId },
    select: { id: true, status: true, allocated: true, totalKes: true, items: true },
  })
  if (!purchase) {
    return NextResponse.json({ success: false, message: "Purchase not found" }, { status: 404 })
  }
  return NextResponse.json({ success: true, data: purchase })
}
