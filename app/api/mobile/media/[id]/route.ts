import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { prisma } from "@/lib/prisma"
import { serializeMobileUserWithCounts } from "@/lib/mobile-users"

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }
  const { id } = await context.params
  const media = await prisma.userMedia.findUnique({
    where: { id },
    include: { user: { include: { media: true } } },
  })
  if (!media || !media.user.isActive || ["BLOCKED", "HIDDEN"].includes(media.user.status)) {
    return NextResponse.json({ success: false, message: "This post is no longer available" }, { status: 404 })
  }
  // Copyright-flagged posts are visible only to their owner.
  if (media.copyrightStatus && media.userId !== session.userId) {
    return NextResponse.json({ success: false, message: "This post is no longer available" }, { status: 404 })
  }

  const user = await serializeMobileUserWithCounts(media.user)
  let gallery = user.gallery
  let targetIndex = gallery.findIndex((item) => item.id === id)
  if (user.profileVideo.id === id) {
    gallery = [user.profileVideo, ...gallery]
    targetIndex = 0
  }
  if (targetIndex < 0) {
    return NextResponse.json({ success: false, message: "This post is no longer available" }, { status: 404 })
  }

  return NextResponse.json({
    success: true,
    data: { user: { ...user, gallery }, mediaId: id, targetIndex },
  })
}
