import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { getLivenessStatus, NeedsAvatarError, submitLivenessVerification } from "@/lib/verification"
import { logError } from "@/lib/log-error"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  const data = await getLivenessStatus(session.userId)
  return NextResponse.json({ success: true, data })
}

export async function POST(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  try {
    const body = await request.json()
    const data = await submitLivenessVerification(session.userId, {
      liveSelfieObjectKey: String(body.liveSelfieObjectKey ?? ""),
      challengesPassed: Array.isArray(body.challengesPassed) ? body.challengesPassed.map(String) : [],
      clientLivenessPassed: Boolean(body.clientLivenessPassed),
    })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof NeedsAvatarError) {
      return NextResponse.json({ success: false, code: "NEEDS_AVATAR", message: error.message }, { status: 409 })
    }
    logError("POST /api/mobile/verification", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Verification failed" },
      { status: 400 },
    )
  }
}
