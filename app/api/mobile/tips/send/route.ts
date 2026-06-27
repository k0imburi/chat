import { TipTier } from "@prisma/client"
import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { sendTipFromWallet, InsufficientTipBalanceError } from "@/lib/mobile-tip-wallet"
import { logError } from "@/lib/log-error"

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  try {
    const body = await request.json()
    const tier = String(body.tier || "").toUpperCase() as TipTier
    const receiverId = String(body.receiverId || "")
    if (!["PEBBLE", "GEM", "DIAMOND"].includes(tier)) return NextResponse.json({ success: false, message: "Invalid tier" }, { status: 400 })
    if (!receiverId) return NextResponse.json({ success: false, message: "receiverId required" }, { status: 400 })
    const result = await sendTipFromWallet({ senderId: session.userId, receiverId, tier })
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    if (error instanceof InsufficientTipBalanceError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 402 })
    }
    logError("/api/mobile/tips/send", error)
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Failed" }, { status: 500 })
  }
}
