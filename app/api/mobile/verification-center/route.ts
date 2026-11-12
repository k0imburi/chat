import { AccountType } from "@prisma/client"
import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { accountType: true, entityDocuments: true, entityDocumentReview: true, entityVerification: true, accountVerification: { select: { status: true, rejectionReason: true, submittedAt: true, reviewedAt: true, idFrontObjectKey: true, idBackObjectKey: true, selfieObjectKey: true } } },
  })
  if (!user) return NextResponse.json({ success: false, message: "Account not found" }, { status: 404 })
  if (user.accountType === AccountType.ENTITY) {
    const documents = user.entityDocuments && typeof user.entityDocuments === "object" && !Array.isArray(user.entityDocuments)
      ? user.entityDocuments as Record<string, unknown> : {}
    const review = user.entityDocumentReview && typeof user.entityDocumentReview === "object" && !Array.isArray(user.entityDocumentReview)
      ? user.entityDocumentReview as Record<string, { status?: string; reason?: string | null }> : {}
    const keys = ["representativeId", "registration", "supporting"]
    const submitted = keys.filter((key) => typeof documents[key] === "string" && documents[key])
    const states = Object.fromEntries(keys.map((key) => [key, {
      submitted: submitted.includes(key),
      status: submitted.includes(key) ? (review[key]?.status || (user.entityVerification === "APPROVED" ? "APPROVED" : user.entityVerification === "REJECTED" ? "REJECTED" : "PENDING")) : "NOT_SUBMITTED",
      reason: review[key]?.reason || null,
    }]))
    const status = submitted.length === 0 ? "NOT_SUBMITTED" : submitted.length < keys.length ? "INCOMPLETE" : user.entityVerification
    return NextResponse.json({ success: true, data: { accountType: "ENTITY", status, documents: states } })
  }
  const verification = user.accountVerification
  return NextResponse.json({ success: true, data: {
    accountType: "INDIVIDUAL",
    status: verification?.status || "NOT_SUBMITTED",
    rejectionReason: verification?.rejectionReason || null,
    submittedAt: verification?.submittedAt || null,
    reviewedAt: verification?.reviewedAt || null,
    documents: { idFront: !!verification?.idFrontObjectKey, idBack: !!verification?.idBackObjectKey, selfie: !!verification?.selfieObjectKey },
  } })
}

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { accountType: true } })
  if (user?.accountType !== AccountType.INDIVIDUAL) {
    return NextResponse.json({ success: false, message: "Individual account required" }, { status: 403 })
  }
  try {
    const body = await request.json() as Record<string, unknown>
    const keys = {
      idFrontObjectKey: String(body.idFrontObjectKey || ""),
      idBackObjectKey: String(body.idBackObjectKey || ""),
      selfieObjectKey: String(body.selfieObjectKey || ""),
    }
    if (Object.values(keys).some((key) => !key.startsWith(`private/${session.userId}/`) || key.length > 1024)) {
      return NextResponse.json({ success: false, message: "Upload all required identity documents first." }, { status: 400 })
    }
    const verification = await prisma.accountVerification.upsert({
      where: { userId: session.userId },
      create: { userId: session.userId, ...keys, status: "PENDING", submittedAt: new Date() },
      update: { ...keys, status: "PENDING", rejectionReason: null, submittedAt: new Date(), reviewedAt: null, reviewerId: null },
      select: { status: true, submittedAt: true },
    })
    return NextResponse.json({ success: true, data: verification })
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Submission failed" }, { status: 400 })
  }
}
