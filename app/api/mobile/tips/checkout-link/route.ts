import { TipTier } from "@prisma/client"
import { NextResponse } from "next/server"
import { getMobileSessionFromRequest, signCheckoutToken } from "@/lib/mobile-session"
import { env } from "@/lib/env"

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  const body = await request.json()
  const tier = String(body.tier || "").toUpperCase() as TipTier
  const creatorId = String(body.creatorId || "")
  if (!creatorId || !["PEBBLE", "GEM", "DIAMOND"].includes(tier)) return NextResponse.json({ success: false, message: "Invalid tip" }, { status: 400 })
  const token = await signCheckoutToken(session.userId)
  const base = (env.APP_URL || "https://chatandtip.com").replace(/\/$/, "")
  return NextResponse.json({ success: true, data: { url: `${base}/tip?t=${encodeURIComponent(token)}&creator=${encodeURIComponent(creatorId)}&tier=${tier}` } })
}
