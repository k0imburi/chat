import { NextResponse } from "next/server"
import { z } from "zod"
import { initiateEntityPlanCheckout } from "@/lib/entity-plan-checkout"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"

const schema = z.object({
  productId: z.enum(["entity_business_monthly", "entity_business_yearly", "entity_premium_monthly", "entity_premium_yearly"]),
})

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  try {
    const body = schema.parse(await request.json())
    const checkout = await initiateEntityPlanCheckout(session.userId, body.productId)
    return NextResponse.json({ success: true, data: checkout })
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message ?? "Invalid request" : error instanceof Error ? error.message : "Could not start checkout"
    return NextResponse.json({ success: false, message }, { status: 400 })
  }
}
