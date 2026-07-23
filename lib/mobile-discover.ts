import "server-only"

import { prisma } from "@/lib/prisma"
import { serializeMobileUserWithLikes } from "@/lib/mobile-users"
import { FEED_LIMIT, hotScore } from "@/lib/discover-score"

// Stable non-cryptographic hash for a string — used to tiebreak trending.
function idHashFraction(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return ((h >>> 0) % 10_000) / 10_000
}

export async function getDiscoverFeed(currentUserId: string) {
  const [currentUser, followRows, seenRows, savedRows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: currentUserId },
      include: {
        media: true,
        blockedUsers: true,
        blockedByUsers: true,
        sentLikes: true,
        sentSwipes: true,
      },
    }),
    prisma.follow.findMany({
      where: { followerId: currentUserId },
      select: { followedId: true },
    }),
    prisma.discoverSeen.findMany({
      where: { userId: currentUserId },
      select: { mediaId: true },
    }),
    prisma.savedVideo.findMany({
      where: { userId: currentUserId },
      select: { mediaId: true },
    }),
  ])

  if (!currentUser) {
    throw new Error("Current user not found")
  }

  const seenMediaIds = new Set(seenRows.map((row) => row.mediaId))
  const savedMediaIds = new Set(savedRows.map((row) => row.mediaId))
  const followedIds = followRows.map((r) => r.followedId)

  const blockedIds = new Set<string>([
    ...currentUser.blockedUsers.map((item) => item.blockedId),
    ...currentUser.blockedByUsers.map((item) => item.blockerId),
  ])

  const likedMediaIds = new Set(
    currentUser.sentLikes.map((item) => item.mediaId).filter((value): value is string => Boolean(value)),
  )
  const swipedIds = new Set(currentUser.sentSwipes.map((item) => item.receiverId))

  // Discover shows EVERYONE (minus blocked), ordered followed-first then the
  // rest — so the feed never dead-ends after you've seen your follows' posts.
  const followedSet = new Set(followedIds)
  const candidates = await prisma.user.findMany({
    where: {
      status: { notIn: ["BLOCKED", "HIDDEN"] },
      id: { not: currentUserId },
    },
    include: { media: true },
    orderBy: { createdAt: "desc" },
  })

  const filteredUsers = candidates.filter((candidate) => {
    if (blockedIds.has(candidate.id)) return false
    if (swipedIds.has(candidate.id)) return false
    // Keep anyone with at least one gallery post (video OR image).
    return candidate.media.some(
      (item) => item.kind === "GALLERY_VIDEO" || item.kind === "IMAGE",
    )
  })

  const now = Date.now()

  // Build one feed entry per gallery post, scored by the hot algorithm.
  const entries = filteredUsers
    .map((user) => {
      const serialized = serializeMobileUserWithLikes(user, likedMediaIds, savedMediaIds)
      const videos = (Array.isArray(serialized.gallery)
        ? (serialized.gallery as Array<Record<string, unknown>>)
        : []
      ).filter((v) => !v.copyrightStatus && !v.reportStatus) // hide copyright-flagged & reported posts
      // Strip gallery from the user profile — the app only needs avatar/name,
      // not the full post list. Keeps the response payload small.
      const { gallery: _g, ...userProfile } = serialized
      const followed = followedSet.has(user.id)
      const sameLang = (user.language || "en") === (currentUser.language || "en")
      return videos.map((video) => {
        const id = String(video.id || "")
        const createdAt = new Date(String(video.createdAt || now))
        return {
          user: userProfile,
          video,
          _followed: followed,
          _sameLang: sameLang,
          _seen: id ? seenMediaIds.has(id) : false,
          _createdAt: createdAt.getTime(),
          _rand: Math.random(),
        }
      })
    })
    .flat()

  // Discover ordering: followed creators first (unseen → newest first), then
  // everyone else in a fresh random order each load. This keeps the feed
  // personal at the top, never dead-ends when follows run out, and is always
  // visibly different from Trending (which ranks purely by the hot-score
  // algorithm) — no engagement/hotScore sorting here.
  entries.sort((a, b) => {
    if (a._followed !== b._followed) return a._followed ? -1 : 1
    // Prefer creators who share the viewer's language (soft bias, not a hard
    // filter — a thin same-language pool must never empty the feed).
    if (a._sameLang !== b._sameLang) return a._sameLang ? -1 : 1
    if (a._seen !== b._seen) return a._seen ? 1 : -1
    if (a._followed) return b._createdAt - a._createdAt
    return a._rand - b._rand
  })

  // Strip internal scoring fields before returning.
  return entries
    .slice(0, FEED_LIMIT)
    .map(({ user, video }) => ({ user, video }))
}

export async function getTrendingFeed(currentUserId?: string) {
  const [users, savedRows, likedRows] = await Promise.all([
    prisma.user.findMany({
      where: {
        status: { notIn: ["BLOCKED", "HIDDEN"] },
      },
      include: { media: true },
    }),
    currentUserId
      ? prisma.savedVideo.findMany({ where: { userId: currentUserId }, select: { mediaId: true } })
      : Promise.resolve([]),
    currentUserId
      ? prisma.videoLike.findMany({ where: { senderId: currentUserId }, select: { mediaId: true } })
      : Promise.resolve([]),
  ])

  const savedMediaIds = new Set(savedRows.map((row) => row.mediaId))
  const likedMediaIds = new Set(
    likedRows.map((row) => row.mediaId).filter((value): value is string => Boolean(value)),
  )

  const now = Date.now()
  const entries = users
    .flatMap((user) => {
      const serialized = serializeMobileUserWithLikes(user, likedMediaIds, savedMediaIds)
      const videos = (Array.isArray(serialized.gallery)
        ? (serialized.gallery as Array<Record<string, unknown>>)
        : []
      ).filter((v) => !v.copyrightStatus && !v.reportStatus) // hide copyright-flagged & reported posts
      const { gallery: _g, ...userProfile } = serialized
      return videos.map((video) => {
        // Trending is ranked strictly by the hot-score algorithm (engagement
        // blended with recency). This is deliberately a different ordering
        // from discover's following-first / freshness sort, so swapping tabs
        // shows visibly different content. ID hash tiebreaks equal scores.
        const createdAt = new Date(String(video.createdAt ?? now))
        const score = hotScore(
          Number(video.likes ?? 0),
          Number(video.commentCount ?? 0),
          Number(video.views ?? 0),
          createdAt,
          now,
        )
        const tiebreak = idHashFraction(String(video.id ?? "")) * 1e-6
        return { user: userProfile, video, _score: score + tiebreak }
      })
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, FEED_LIMIT)
    .map(({ user, video }) => ({ user, video }))

  return entries
}
