import { AccountType, EntityVerificationStatus } from "@prisma/client"
import { NextResponse } from "next/server"
import { z } from "zod"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { prisma } from "@/lib/prisma"

const schema = z.object({
  entityDocuments: z.object({
    representativeId: z.string().min(1).optional(),
    registration: z.string().min(1).optional(),
    supporting: z.string().min(1).optional(),
  }).refine((docs) => Object.keys(docs).length > 0, "At least one document is required"),
})

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  try {
    const body = schema.parse(await request.json())
    const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { accountType: true, entityDocuments: true, entityDocumentReview: true, entityVerification: true } })
    if (user?.accountType !== AccountType.ENTITY) {
      return NextResponse.json({ success: false, message: "Entity account required" }, { status: 403 })
    }
    const priorDocs = user.entityDocuments && typeof user.entityDocuments === "object" && !Array.isArray(user.entityDocuments)
      ? user.entityDocuments as Record<string, string> : {}
    const priorReview = user.entityDocumentReview && typeof user.entityDocumentReview === "object" && !Array.isArray(user.entityDocumentReview)
      ? user.entityDocumentReview as Record<string, { status?: string; reason?: string | null }> : {}
    const incoming = body.entityDocuments as Record<string, string>
    if (Object.values(incoming).some((key) => !key.startsWith(`private/${session.userId}/`) || key.length > 1024)) {
      return NextResponse.json({ success: false, message: "Document upload is invalid." }, { status: 400 })
    }
    const initialSubmission = Object.keys(priorDocs).length === 0
    if (initialSubmission && !["representativeId", "registration", "supporting"].every((key) => incoming[key])) {
      return NextResponse.json({ success: false, message: "Submit all required entity documents." }, { status: 400 })
    }
    if (!initialSubmission && Object.keys(incoming).some((key) => priorReview[key]?.status !== "REJECTED" && user.entityVerification !== EntityVerificationStatus.REJECTED)) {
      return NextResponse.json({ success: false, message: "Only declined documents can be replaced." }, { status: 400 })
    }
    const mergedDocs = { ...priorDocs, ...incoming }
    const mergedReview = { ...priorReview }
    for (const key of Object.keys(incoming)) mergedReview[key] = { status: "PENDING", reason: null }
    await prisma.user.update({
      where: { id: session.userId },
      data: {
        entityDocuments: mergedDocs,
        entityDocumentReview: mergedReview,
        entityVerification: EntityVerificationStatus.PENDING,
        entityPublishedAt: null,
        entityBadgeColor: null,
        verified: false,
      },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof z.ZodError
      ? error.issues[0]?.message ?? "Invalid documents"
      : error instanceof Error ? error.message : "Could not submit documents"
    return NextResponse.json({ success: false, message }, { status: 400 })
  }
}
