import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { qrMatches } from "@/lib/qr-signin"
const schema = z.object({ id: z.string().min(1).max(100), approval: z.string().min(40).max(100) })
export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return new Response("Unauthorized", { status: 401 })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return new Response("Invalid request", { status: 400 })
  const row = await prisma.qrSignInChallenge.findUnique({ where: { id: parsed.data.id } })
  if (!row || !qrMatches(parsed.data.approval, row.approvalHash)) return new Response("Invalid code", { status: 404 })
  const updated = await prisma.qrSignInChallenge.updateMany({ where: { id: row.id, approvedUserId: null, consumedAt: null, expiresAt: { gt: new Date() } }, data: { approvedUserId: session.userId } })
  if (!updated.count) return new Response("Code expired or already used", { status: 409 })
  return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } })
}
