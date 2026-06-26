import { TipTier } from "@prisma/client"
import { NextResponse } from "next/server"
import { getCheckoutActorUserId } from "@/lib/checkout-auth"
import { initiateTipPurchase } from "@/lib/mobile-tip-purchase"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request) {
  const senderId = await getCheckoutActorUserId(request)
  if (!senderId) return NextResponse.json({ success: false, message: "Sign in or open a fresh checkout link" }, { status: 401 })
  try {
    const body = await request.json()
    const data = await initiateTipPurchase({ senderId, receiverId: String(body.creatorId || ""), tier: String(body.tier || "").toUpperCase() as TipTier, phone: String(body.phone || "") })
    return NextResponse.json({ success: data.success, data })
  } catch (error) { return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Tip failed" }, { status: 400 }) }
}

export async function GET(request: Request) {
  const senderId = await getCheckoutActorUserId(request)
  if (!senderId) return NextResponse.json({ success: false }, { status: 401 })
  const id = new URL(request.url).searchParams.get("purchaseId") || ""
  const data = await prisma.tipPurchase.findFirst({ where: { id, senderId }, select: { id: true, status: true, recorded: true } })
  return data ? NextResponse.json({ success: true, data }) : NextResponse.json({ success: false }, { status: 404 })
}
