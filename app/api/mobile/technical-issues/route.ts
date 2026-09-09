import { NextResponse } from "next/server"
import { z } from "zod"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/log-error"

const schema = z.object({
  subject: z.string().trim().min(3, "Please add a short subject").max(120),
  description: z.string().trim().min(10, "Please describe the problem in a little more detail").max(5000),
  appVersion: z.string().trim().max(50).optional(),
  platform: z.string().trim().max(100).optional(),
})

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const input = schema.parse(await request.json())
    const issue = await prisma.technicalIssue.create({
      data: { userId: session.userId, ...input },
      select: { id: true },
    })
    return NextResponse.json({
      success: true,
      issueId: issue.id,
      message: "Thanks. Your technical problem has been sent to our team.",
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, message: error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      )
    }
    logError("/api/mobile/technical-issues", error)
    return NextResponse.json(
      { success: false, message: "We could not send your report. Please try again." },
      { status: 500 },
    )
  }
}
