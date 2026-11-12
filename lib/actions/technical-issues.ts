"use server"

import { revalidatePath } from "next/cache"
import { TechnicalIssueStatus } from "@prisma/client"
import { requireSupportAdmin } from "@/lib/support-admin"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { SUPPORT_TYPING_TTL_MS, supportMessageSchema } from "@/lib/support-contract"
import { getTechnicalIssues, updateTechnicalIssueStatus } from "@/lib/technical-issues"
import { createUserNotification } from "@/lib/mobile-notifications"

export async function queryTechnicalIssuesAction(query: string, queue: "technical" | "support" = "technical") {
  await requireSupportAdmin()
  return getTechnicalIssues(query, queue)
}

export async function updateTechnicalIssueStatusAction(
  issueId: string,
  status: TechnicalIssueStatus,
) {
  await requireSupportAdmin()
  z.nativeEnum(TechnicalIssueStatus).parse(status)
  await updateTechnicalIssueStatus(issueId, status)
  revalidatePath("/technical-problems")
  revalidatePath("/support-tickets")
  revalidatePath(`/technical-problems/${issueId}`)
}

export async function getTechnicalIssueAction(issueId: string) {
  await requireSupportAdmin()
  return prisma.technicalIssue.findUnique({
    where: { id: z.string().min(1).max(191).parse(issueId) },
    include: { user: { select: { fullName: true } }, replies: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  })
}

export async function replyToTechnicalIssueAction(issueId: string, message: string) {
  const admin = await requireSupportAdmin()
  const input = supportMessageSchema.parse({ ticketId: issueId, message })
  const issue = await prisma.$transaction(async (tx) => {
    const updated = await tx.technicalIssue.update({
      where: { id: input.ticketId },
      data: { status: "IN_PROGRESS", resolvedAt: null, replies: { create: { authorId: admin.id, message: input.message, fromAdmin: true } } },
      select: { userId: true, ticketNumber: true },
    })
    await tx.technicalIssueTyping.deleteMany({ where: { issueId, agentId: admin.id } })
    return updated
  })
  await createUserNotification({
    userId: issue.userId,
    type: "support_response",
    title: "ChatAndTip Support",
    message: `Support replied to ticket C#${issue.ticketNumber ?? ""}`,
    metadata: { ticketId: issueId },
  })
  revalidatePath("/technical-problems")
  revalidatePath("/support-tickets")
  revalidatePath(`/technical-problems/${issueId}`)
}

export async function setTechnicalIssueTypingAction(issueId: string, typing: boolean) {
  const admin = await requireSupportAdmin()
  z.string().min(1).max(191).parse(issueId)
  z.boolean().parse(typing)
  if (!typing) {
    await prisma.technicalIssueTyping.deleteMany({ where: { issueId, agentId: admin.id } })
    return
  }
  const expiresAt = new Date(Date.now() + SUPPORT_TYPING_TTL_MS)
  await prisma.technicalIssueTyping.upsert({
    where: { issueId_agentId: { issueId, agentId: admin.id } },
    create: { issueId, agentId: admin.id, expiresAt }, update: { expiresAt },
  })
}
