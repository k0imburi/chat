import { NextResponse } from "next/server"
import { findMobileUserById, serializeMobileUserWithCounts } from "@/lib/mobile-users"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const user = await findMobileUserById(id)

  if (!user) {
    return NextResponse.json({ success: false, message: "User not found" }, { status: 404 })
  }

  const session = await getMobileSessionFromRequest(request)
  const serialized = await serializeMobileUserWithCounts(user)

  // Copyright-flagged and reported posts are visible only to their owner.
  if (session?.userId !== id && Array.isArray(serialized.gallery)) {
    serialized.gallery = serialized.gallery.filter((v) => {
      const item = v as { copyrightStatus?: string | null; reportStatus?: string | null; isHiddenByOwner?: boolean }
      return !item.copyrightStatus && !item.reportStatus && !item.isHiddenByOwner
    })
  }

  return NextResponse.json({ success: true, user: serialized })
}
