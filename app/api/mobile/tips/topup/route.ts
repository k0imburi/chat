import { TipTier } from "@prisma/client"
import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { initiateTipTopup } from "@/lib/mobile-tip-wallet"
import { logError } from "@/lib/log-error"

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  try {
    const body = await request.json()
    const tier = String(body.tier || "").toUpperCase() as TipTier
    const qty = Math.max(1, Math.min(20, Number(body.qty) || 1))
    const phone = String(body.phone || "")
    if (!["PEBBLE", "GEM", "DIAMOND"].includes(tier)) return NextResponse.json({ success: false, message: "Invalid tier" }, { status: 400 })
    if (!phone) return NextResponse.json({ success: false, message: "Phone required" }, { status: 400 })
    const result = await initiateTipTopup({ userId: session.userId, tier, qty, phone })
    return NextResponse.json({ success: result.success, message: result.message, data: result })
  } catch (error) {
    logError("/api/mobile/tips/topup", error)
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Failed" }, { status: 500 })
  }
}
