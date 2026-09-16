import { NextResponse } from "next/server"
import { scheduledDeletionAt } from "@/lib/account-deactivation-policy"
import { deactivateAccount } from "@/lib/account-deactivation"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ success: true, data: { scheduledDeletionAt: scheduledDeletionAt(new Date()).toISOString() } })
}

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  const account = await prisma.user.findUnique({ where: { id: session.userId }, select: { accountType: true } })
  if (account?.accountType === "ENTITY") {
    return NextResponse.json({ success: false, message: "Contact support to deactivate an entity account" }, { status: 403 })
  }
  const result = await deactivateAccount(session.userId)
  return NextResponse.json({ success: true, data: {
    deactivatedAt: result.deactivatedAt?.toISOString(),
    scheduledDeletionAt: result.scheduledDeletionAt?.toISOString(),
  } })
}
