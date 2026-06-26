import "server-only"

import { MediaKind, UserRole } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { hotScore, W_LIKE, W_COMMENT, W_VIEW, GRAVITY, FEED_LIMIT } from "@/lib/discover-score"

export type RankedPost = {
  id: string
  owner: string
  ownerId: string
  /** True when the owner has role=USER — these posts appear in the mobile trending/explore feed */
  inMobileFeed: boolean
  thumbnailUrl: string
  kind: "image" | "video"
  ageHours: number
  likes: number
  comments: number
  views: number
  engagement: number
  /** Recency multiplier = 1 / (ageHours + 2)^gravity. score = (engagement+1) * recencyFactor */
  recencyFactor: number
  score: number
}

export type ExploreInsights = {
  weights: { like: number; comment: number; view: number; gravity: number; limit: number }
  summary: {
    totalPosts: number
    mobileFeedPosts: number
    images: number
    videos: number
    totalLikes: number
    totalComments: number
    totalViews: number
    seenRecords: number
    viewersTracked: number
  }
  posts: RankedPost[]
}

/**
 * Platform-wide view of the explore/discover ranking, as a fresh viewer would
 * see it (seen-tracking is per-user, so this shows the pure hot-score order).
 * `inMobileFeed` marks posts whose owner has role=USER — only those appear in
 * the mobile trending/explore feed.
 */
export async function getExploreInsights(limit = 2000): Promise<ExploreInsights> {
  const media = await prisma.userMedia.findMany({
    where: { kind: { in: [MediaKind.GALLERY_VIDEO, MediaKind.IMAGE] } },
    include: { user: { select: { fullName: true, role: true } } },
  })

  const seenAgg = await prisma.discoverSeen.groupBy({
    by: ["userId"],
    _count: { _all: true },
  })
  const seenRecords = seenAgg.reduce((sum, row) => sum + row._count._all, 0)

  const now = Date.now()
  const posts: RankedPost[] = media
    .map((m) => {
      const engagement = m.likes * W_LIKE + m.commentCount * W_COMMENT + m.views * W_VIEW
      const ageHours = (now - m.createdAt.getTime()) / 3_600_000
      const recencyFactor = 1 / Math.pow(Math.max(0, ageHours) + 2, GRAVITY)
      return {
        id: m.id,
        owner: m.user.fullName,
        ownerId: m.userId,
        inMobileFeed: m.user.role === UserRole.USER,
        thumbnailUrl: m.thumbnailUrl || m.url || "",
        kind: m.kind === MediaKind.IMAGE ? ("image" as const) : ("video" as const),
        ageHours,
        likes: m.likes,
        comments: m.commentCount,
        views: m.views,
        engagement,
        recencyFactor,
        score: hotScore(m.likes, m.commentCount, m.views, m.createdAt, now),
      }
    })
    .sort((a, b) => b.score - a.score)

  const summary = {
    totalPosts: posts.length,
    mobileFeedPosts: posts.filter((p) => p.inMobileFeed).length,
    images: posts.filter((p) => p.kind === "image").length,
    videos: posts.filter((p) => p.kind === "video").length,
    totalLikes: posts.reduce((s, p) => s + p.likes, 0),
    totalComments: posts.reduce((s, p) => s + p.comments, 0),
    totalViews: posts.reduce((s, p) => s + p.views, 0),
    seenRecords,
    viewersTracked: seenAgg.length,
  }

  return {
    weights: { like: W_LIKE, comment: W_COMMENT, view: W_VIEW, gravity: GRAVITY, limit: FEED_LIMIT },
    summary,
    posts: posts.slice(0, limit),
  }
}
