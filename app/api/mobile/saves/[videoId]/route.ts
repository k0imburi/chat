import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { prisma } from "@/lib/prisma"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  const { videoId } = await params

  const media = await prisma.userMedia.findUnique({ where: { id: videoId } })
  if (!media) {
    return NextResponse.json({ success: false, message: "Video not found" }, { status: 404 })
  }

  const existing = await prisma.savedVideo.findUnique({
    where: { userId_mediaId: { userId: session.userId, mediaId: videoId } },
  })

  if (existing) {
    await prisma.savedVideo.delete({ where: { id: existing.id } })
    return NextResponse.json({ success: true, saved: false })
  }

  await prisma.savedVideo.create({
    data: { userId: session.userId, mediaId: videoId },
  })

  return NextResponse.json({ success: true, saved: true })
}
