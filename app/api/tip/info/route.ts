import { TipTier } from "@prisma/client"
import { NextResponse } from "next/server"
import { getCheckoutActorUserId } from "@/lib/checkout-auth"
import { prisma } from "@/lib/prisma"
import { TIP_CREATOR_SHARE, TIP_USD } from "@/lib/mobile-credits"

export async function GET(request: Request) {
  const userId = await getCheckoutActorUserId(request)
  if (!userId) return NextResponse.json({ success: false, message: "Sign in or open a fresh checkout link" }, { status: 401 })
  const p = new URL(request.url).searchParams
  const creatorId = p.get("creator") || ""
  const tier = (p.get("tier") || "").toUpperCase() as TipTier
  if (!["PEBBLE", "GEM", "DIAMOND"].includes(tier)) return NextResponse.json({ success: false, message: "Invalid tier" }, { status: 400 })
  const [creator, sender, settings] = await Promise.all([
    prisma.user.findUnique({ where: { id: creatorId }, select: { id: true, fullName: true, avatarUrl: true, earningSuspendedUntil: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { phoneNumber: true } }),
    prisma.appSettings.findUnique({ where: { id: 1 } }),
  ])
  if (!creator) return NextResponse.json({ success: false, message: "Creator not found" }, { status: 404 })
  if (creator.earningSuspendedUntil && creator.earningSuspendedUntil > new Date()) return NextResponse.json({ success: false, message: "Tips are temporarily unavailable" }, { status: 403 })
  const usd = TIP_USD[tier], rate = Number(settings?.usdToKesRate || 0)
  return NextResponse.json({ success: true, data: { creator, tier, usd, totalKes: Math.ceil(usd * rate), creatorShareUsd: usd * TIP_CREATOR_SHARE, phoneNumber: sender?.phoneNumber } })
}
