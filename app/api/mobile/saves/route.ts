import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { prisma } from "@/lib/prisma"
import { MediaKind } from "@prisma/client"

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  const saved = await prisma.savedVideo.findMany({
    where: { userId: session.userId },
    orderBy: { savedAt: "desc" },
    include: {
      media: {
        include: { user: true },
      },
    },
  })

  const data = saved.map(({ media }) => ({
    id: media.id,
    userId: media.userId,
    videoUrl: media.kind !== MediaKind.IMAGE ? media.url : "",
    imageUrl: media.kind === MediaKind.IMAGE ? media.url : "",
    thumbnailUrl: media.thumbnailUrl || media.url,
    title: media.title || "",
    caption: media.caption || "",
    views: media.views,
    likes: media.likes,
    commentCount: media.commentCount,
    createdAt: media.createdAt.toISOString(),
    user: {
      userId: media.user.id,
      fullName: media.user.fullName,
      avatarUrl: media.user.avatarUrl || "",
    },
  }))

  return NextResponse.json({ success: true, data })
}
