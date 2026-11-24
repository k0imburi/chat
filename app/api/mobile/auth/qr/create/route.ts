import { prisma } from "@/lib/prisma"
import { qrHash, qrSecret } from "@/lib/qr-signin"
// A per-instance backstop; the edge should also enforce rate limits in production.
const attempts = new Map<string, { count: number; reset: number }>()
export async function POST(request: Request) {
  const now = Date.now()
  if (attempts.size > 10000) for (const [key, value] of attempts) if (value.reset <= now) attempts.delete(key)
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "unknown"
  const current = attempts.get(ip)
  const entry = !current || current.reset <= now ? { count: 0, reset: now + 60000 } : current
  if (++entry.count > 10) return new Response("Try again later", { status: 429 })
  attempts.set(ip, entry)
  if (Math.random() < 0.02) await prisma.qrSignInChallenge.deleteMany({ where: { expiresAt: { lt: new Date(now - 86400000) } } })
  const poll = qrSecret(), approval = qrSecret(), expiresAt = new Date(now + 120000)
  const row = await prisma.qrSignInChallenge.create({ data: { pollHash: qrHash(poll), approvalHash: qrHash(approval), expiresAt }, select: { id: true } })
  return Response.json({ success: true, data: { id: row.id, poll, approval, expiresAt: expiresAt.toISOString() } }, { headers: { "Cache-Control": "no-store" } })
}
