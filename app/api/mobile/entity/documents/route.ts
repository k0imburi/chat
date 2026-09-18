import { AccountType, EntityVerificationStatus } from "@prisma/client"
import { NextResponse } from "next/server"
import { z } from "zod"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { prisma } from "@/lib/prisma"

const schema = z.object({
  entityDocuments: z.object({
    representativeId: z.string().min(1),
    registration: z.string().min(1),
    supporting: z.string().min(1),
  }),
})

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  try {
    const body = schema.parse(await request.json())
    const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { accountType: true } })
    if (user?.accountType !== AccountType.ENTITY) {
      return NextResponse.json({ success: false, message: "Entity account required" }, { status: 403 })
    }
    await prisma.user.update({
      where: { id: session.userId },
      data: {
        entityDocuments: body.entityDocuments,
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
