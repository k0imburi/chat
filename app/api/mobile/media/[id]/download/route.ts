import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  const { id } = await context.params
  const media = await prisma.userMedia.findUnique({
    where: { id },
    include: { user: { select: { id: true, allowPostDownloads: true, isActive: true, status: true } } },
  })
  if (!media || !media.user.isActive || ["BLOCKED", "HIDDEN"].includes(media.user.status) ||
      media.isHiddenByOwner || media.copyrightStatus || media.reportStatus) {
    return NextResponse.json({ success: false, message: "This post is no longer available" }, { status: 404 })
  }
  if (!media.user.allowPostDownloads) {
    return NextResponse.json({ success: false, message: "The creator has disabled downloads" }, { status: 403 })
  }
  return NextResponse.json({ success: true, data: { url: media.url, images: media.images } })
}
