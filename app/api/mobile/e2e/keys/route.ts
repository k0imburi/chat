import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { prisma } from "@/lib/prisma"

// POST /api/mobile/e2e/keys
// Body: { publicKey: string }  (base64url-encoded X25519 public key, 32 bytes)
// Upserts the UserKey for the authenticated user.
export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  let body: { publicKey?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON" }, { status: 400 })
  }

  const { publicKey } = body
  if (!publicKey || typeof publicKey !== "string" || publicKey.trim().length === 0) {
    return NextResponse.json({ success: false, message: "publicKey is required" }, { status: 400 })
  }

  await prisma.userKey.upsert({
    where: { userId: session.userId },
    update: { publicKey: publicKey.trim() },
    create: { userId: session.userId, publicKey: publicKey.trim() },
  })

  return NextResponse.json({ ok: true })
}
