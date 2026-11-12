import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { serializeVideo } from "@/lib/mobile-users"
import { FEED_LIMIT } from "@/lib/discover-score"
import { logError } from "@/lib/log-error"

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams
  const community = query.get("mode") === "community"
  const cursor = query.get("cursor") || undefined
  try {
    const rows = await prisma.userMedia.findMany({
      where: {
        kind: { in: ["GALLERY_VIDEO", "IMAGE"] },
        adCampaignId: null,
        ...(query.get("userId") ? { userId: query.get("userId")! } : {}),
        isHiddenByOwner: false,
        copyrightStatus: null,
        reportStatus: null,
        user: { isActive: true, status: "ACTIVE" },
      },
      include: {
        user: { select: {
          id: true, fullName: true, username: true, language: true, bio: true,
          verified: true, accountType: true, entityVerification: true,
          entityBadgeColor: true,
        } },
      },
      orderBy: community
        ? [{ likes: "desc" }, { createdAt: "desc" }, { id: "desc" }]
        : [{ createdAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: FEED_LIMIT + 1,
    })
    const more = rows.length > FEED_LIMIT
    const page = rows.slice(0, FEED_LIMIT)
    const data = page.map(({ user, ...media }) => ({
      user: {
        userId: user.id,
        fullname: user.fullName,
        username: user.username || "",
        language: user.language,
        bio: user.bio || "",
        verified: user.verified,
        accountType: user.accountType.toLowerCase(),
        entityVerification: user.entityVerification.toLowerCase(),
        entityBadgeColor: user.entityBadgeColor || "",
        profileAvatarUrl: `/api/mobile/users/${encodeURIComponent(user.id)}/avatar`,
      },
      video: serializeVideo(media),
    }))
    return NextResponse.json({ success: true, data,
      nextCursor: more ? page.at(-1)?.id : null,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    logError("Public feed", error)
    return NextResponse.json({ success: false, message: "Unable to load posts" }, { status: 500 })
  }
}
