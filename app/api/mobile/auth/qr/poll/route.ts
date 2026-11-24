import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { signMobileSessionToken } from "@/lib/mobile-session"
import { qrMatches } from "@/lib/qr-signin"
const schema = z.object({ id: z.string().min(1).max(100), poll: z.string().min(40).max(100) })
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return new Response("Invalid request", { status: 400 })
  const row = await prisma.qrSignInChallenge.findUnique({ where: { id: parsed.data.id } })
  if (!row || !qrMatches(parsed.data.poll, row.pollHash)) return new Response("Invalid code", { status: 404 })
  if (row.expiresAt <= new Date() || row.consumedAt) return new Response("Code expired or already used", { status: 410 })
  if (!row.approvedUserId) return Response.json({ success: true, status: "pending" }, { headers: { "Cache-Control": "no-store" } })
  const user = await prisma.user.findUnique({ where: { id: row.approvedUserId }, select: { id: true, isActive: true, status: true, deactivatedAt: true, accountPurgedAt: true, email: true, phoneNumber: true, loginProvider: true } })
  if (!user || !user.isActive || user.deactivatedAt || user.accountPurgedAt || ["BLOCKED", "HIDDEN"].includes(user.status)) return new Response("Account unavailable", { status: 403 })
  const consumed = await prisma.qrSignInChallenge.updateMany({ where: { id: row.id, approvedUserId: user.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } })
  if (!consumed.count) return new Response("Code expired or already used", { status: 410 })
  const token = await signMobileSessionToken({ userId: user.id, email: user.email, phoneNumber: user.phoneNumber, loginProvider: user.loginProvider })
  return Response.json({ success: true, status: "approved", token }, { headers: { "Cache-Control": "no-store" } })
}
