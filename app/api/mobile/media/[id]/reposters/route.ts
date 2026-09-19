import { NextResponse } from "next/server"
import { getMobileSessionFromRequest } from "@/lib/mobile-session"
import { AccountType } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getMobileSessionFromRequest(request)
  if (!session?.userId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  const { id: mediaId } = await context.params
  const params = new URL(request.url).searchParams
  const limit = Math.min(50, Math.max(1, Number(params.get("limit")) || 30))
  const cursor = params.get("cursor") || undefined
  const media = await prisma.userMedia.findUnique({ where: { id: mediaId }, select: { id: true, isHiddenByOwner: true, copyrightStatus: true, reportStatus: true } })
  if (!media || media.isHiddenByOwner || media.copyrightStatus || media.reportStatus) {
    return NextResponse.json({ success: false, message: "This post is no longer available" }, { status: 404 })
  }
  const rows = await prisma.mediaRepost.findMany({
    where: {
      mediaId,
      user: {
        isActive: true,
        status: { notIn: ["BLOCKED", "HIDDEN"] },
        OR: [{ externalId: null }, { externalId: { not: { startsWith: "system:" } } }],
      },
    },
    include: { user: { include: { media: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })
  const hasMore = rows.length > limit
  const page = rows.slice(0, limit)
  const data = page.map(({ user }) => {
    const profile = user.media
      .filter((item) => item.kind === "PROFILE_IMAGE" || item.kind === "PROFILE_VIDEO")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
    const rawAvatar = user.avatarUrl || profile?.thumbnailUrl || profile?.url || ""
    return {
      id: user.id,
      name: user.fullName || user.username || "Someone",
      username: user.username || "",
      avatarUrl: rawAvatar ? `${rawAvatar}${rawAvatar.includes("?") ? "&" : "?"}v=${user.updatedAt.getTime()}` : "",
      fallbackAsset: user.gender?.toUpperCase() === "M" ? "assets/male.png" : "assets/female.png",
      isVerified: user.verified,
      isBroadcaster: user.externalId === "system:chatandtip",
      isEntity: user.accountType === AccountType.ENTITY,
      entityVerification: user.entityVerification.toLowerCase(),
      entityBadgeColor: user.entityBadgeColor || "",
    }
  })
  return NextResponse.json({ success: true, data, nextCursor: hasMore ? page.at(-1)?.id ?? null : null })
}
