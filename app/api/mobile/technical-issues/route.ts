import { NextResponse } from "next/server"
import { z } from "zod"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/log-error"
import { isAgentTyping, supportMessageSchema, supportTicketLabel } from "@/lib/support-contract"
import { getCustomerOrMobileSession } from "@/lib/customer-mobile-session"

const conversation = {
  replies: { select: { id: true, message: true, createdAt: true, fromAdmin: true }, orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
  typing: { select: { expiresAt: true } },
}

function serializeTicket(issue: { id: string; status: string; ticketNumber: number | null; subject: string; description: string; createdAt: Date; userReadAt: Date | null; replies: { id: string; message: string; createdAt: Date; fromAdmin: boolean }[]; typing: { expiresAt: Date }[] }) {
  const unread = issue.replies.some((reply) => reply.fromAdmin && (!issue.userReadAt || reply.createdAt > issue.userReadAt))
  return { id: issue.id, ticket: supportTicketLabel(issue), message: issue.description, createdAt: issue.createdAt, status: issue.status, replies: issue.replies, agentTyping: isAgentTyping(issue.typing), unread }
}

const schema = z.object({
  subject: z.string().trim().min(3, "Please add a short subject").max(120),
  description: z.string().trim().min(10, "Please describe the problem in a little more detail").max(5000),
  appVersion: z.string().trim().max(50).optional(),
  platform: z.string().trim().max(100).optional(),
})

export async function GET(request: Request) {
  const session = await getCustomerOrMobileSession(request)
  if (!session) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  try {
    const issues = await prisma.technicalIssue.findMany({
      where: { userId: session.userId, subject: { startsWith: "Support chat · C#" } },
      include: conversation,
      orderBy: { createdAt: "desc" },
      take: 100,
    })
    return NextResponse.json({ success: true, data: issues.map(serializeTicket) }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    logError("GET /api/mobile/technical-issues", error)
    return NextResponse.json({ success: false, message: "Unable to load support messages." }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getCustomerOrMobileSession(request)
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json() as Record<string, unknown>
    if (body.action === "mark_read" && typeof body.ticketId === "string") {
      const updated = await prisma.technicalIssue.updateMany({
        where: { id: body.ticketId, userId: session.userId, subject: { startsWith: "Support chat · C#" } },
        data: { userReadAt: new Date() },
      })
      if (!updated.count) return NextResponse.json({ success: false, message: "Ticket not found." }, { status: 404 })
      return NextResponse.json({ success: true })
    }
    if (body && ("message" in body || "ticketId" in body)) {
      const { message, ticketId } = supportMessageSchema.parse(body)
      if (ticketId) {
        const issue = await prisma.$transaction(async (tx) => {
          const owned = await tx.technicalIssue.findFirst({ where: { id: ticketId, userId: session.userId, subject: { startsWith: "Support chat · C#" } }, select: { id: true } })
          if (!owned) return null
          return tx.technicalIssue.update({
            where: { id: owned.id, userId: session.userId },
            data: { status: "OPEN", resolvedAt: null, replies: { create: { authorId: session.userId, message, fromAdmin: false } } },
            include: conversation,
          })
        })
        if (!issue) return NextResponse.json({ success: false, message: "Ticket not found." }, { status: 404 })
        return NextResponse.json({ success: true, data: serializeTicket(issue) })
      }
      const issue = await prisma.$transaction(async (tx) => {
        // This row lock is held until the ticket transaction commits.
        const sequence = await tx.supportTicketSequence.update({ where: { id: 1 }, data: { value: { increment: 1 } } })
        const ticket = supportTicketLabel({ ticketNumber: sequence.value, subject: "" })
        return tx.technicalIssue.create({
          data: { userId: session.userId, ticketNumber: sequence.value, subject: `Support chat · ${ticket}`, description: message },
          include: conversation,
        })
      })
      const ticket = supportTicketLabel(issue)
      return NextResponse.json({
        success: true,
        data: serializeTicket(issue),
        message: `Thank you for writing to us, ticket number ${ticket} has been assigned. The issue will be addressed as soon as possible.`,
      })
    }
    const input = schema.parse(body)
    const issue = await prisma.technicalIssue.create({ data: { userId: session.userId, ...input }, select: { id: true } })
    return NextResponse.json({
      success: true,
      issueId: issue.id,
      message: "Thanks. Your technical problem has been sent to our team.",
    })
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError || error instanceof TypeError) {
      return NextResponse.json(
        { success: false, message: error instanceof z.ZodError ? error.issues[0]?.message ?? "Invalid request" : "Invalid request" },
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
