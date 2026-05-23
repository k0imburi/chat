import { NextResponse } from "next/server"
import { z } from "zod"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { prisma } from "@/lib/prisma"

const schema = z.object({
  message: z.string().min(1),
  reportedUserId: z.string().min(1),
})

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const parsed = schema.parse(await request.json())

    await prisma.report.create({
      data: {
        message: parsed.message,
        reportedUserId: parsed.reportedUserId,
        reportedById: session.userId,
      },
    })

    await prisma.user.update({
      where: { id: parsed.reportedUserId },
      data: { status: "REPORTED" },
    })

    return NextResponse.json({
      success: true,
      message: "Thanks for your report. We'll review this profile as soon as possible.",
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }

    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to report user" },
      { status: 500 },
    )
  }
}
