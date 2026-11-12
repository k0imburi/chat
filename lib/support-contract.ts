import { z } from "zod"

export const SUPPORT_TYPING_TTL_MS = 8000
export const supportMessageSchema = z.object({
  message: z.string().trim().min(1, "Write a message before sending.").max(5000),
  ticketId: z.string().trim().min(1).max(191).optional(),
})

export function supportTicketLabel(issue: { ticketNumber: number | null; subject: string }) {
  return issue.ticketNumber === null
    ? issue.subject.split("·").at(-1)?.trim() || issue.subject
    : `C#${String(issue.ticketNumber).padStart(3, "0")}`
}

export function isAgentTyping(typing: { expiresAt: Date }[], now = new Date()) {
  return typing.some((entry) => entry.expiresAt.getTime() > now.getTime())
}
