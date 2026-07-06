import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET /api/mobile/e2e/keys/[userId]
// No auth required — public keys are public.
// Returns { publicKey: string } or 404 if no key registered.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params

  if (!userId) {
    return NextResponse.json({ message: "userId is required" }, { status: 400 })
  }

  const record = await prisma.userKey.findUnique({
    where: { userId },
    select: { publicKey: true },
  })

  if (!record) {
    return NextResponse.json({ message: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ publicKey: record.publicKey })
}
