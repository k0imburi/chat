import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { prisma } from "@/lib/prisma"
import { submitKyc } from "@/lib/mobile-finance"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  const kyc = await prisma.creatorKyc.findUnique({ where: { userId: session.userId }, select: { status: true, rejectionReason: true, submittedAt: true, reviewedAt: true } })
  return NextResponse.json({ success: true, data: kyc || { status: "NOT_SUBMITTED" } })
}

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  try {
    const body = await request.json()
    const data = await submitKyc(session.userId, { idFrontObjectKey: String(body.idFrontObjectKey || ""), idBackObjectKey: String(body.idBackObjectKey || ""), selfieObjectKey: String(body.selfieObjectKey || "") })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "KYC submission failed" }, { status: 400 })
  }
}
