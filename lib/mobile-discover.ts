import "server-only"

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { serializeMobileUserWithLikes } from "@/lib/mobile-users"
import { FEED_LIMIT, hotScore } from "@/lib/discover-score"

// Stable non-cryptographic hash for a string — used to give trending a
// deterministic shuffle that differs from discover's recency ordering.
function idHashFraction(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return ((h >>> 0) % 10_000) / 10_000
}

function toAge(birthday: Date | null) {
  if (!birthday) return null
  const today = new Date()
  let age = today.getFullYear() - birthday.getFullYear()
  const monthDiff = today.getMonth() - birthday.getMonth()
  const dayDiff = today.getDate() - birthday.getDate()
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age--
  return age
}

function kmDistance(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (value: number) => (value * Math.PI) / 180
  const earthRadiusKm = 6371
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2)

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
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
  const hasFollows = followedIds.length > 0

  const blockedIds = new Set<string>([
    ...currentUser.blockedUsers.map((item) => item.blockedId),
    ...currentUser.blockedByUsers.map((item) => item.blockerId),
  ])

  const likedMediaIds = new Set(
    currentUser.sentLikes.map((item) => item.mediaId).filter((value): value is string => Boolean(value)),
  )
  const swipedIds = new Set(currentUser.sentSwipes.map((item) => item.receiverId))

  // When the user follows people, discover shows only their content (no filters).
  // When they follow nobody yet, fall back to the geo/age/gender-filtered pool.
  const candidates = await prisma.user.findMany({
    where: {
      status: { notIn: ["BLOCKED", "HIDDEN"] },
      ...(hasFollows
        ? { id: { in: followedIds } }
        : { id: { not: currentUserId } }),
    },
    include: { media: true },
    orderBy: { createdAt: "desc" },
  })

  const userFilter = ((currentUser.filter as Prisma.JsonObject | null) ?? {}) as Record<string, unknown>
  const minAge = Number(userFilter.minAge ?? 18)
  const maxAge = Number(userFilter.maxAge ?? 100)
  const maxDistance = Number(userFilter.maxDistance ?? 100)
  const genderFilter = String(userFilter.gender ?? "All")

  const filteredUsers = candidates.filter((candidate) => {
    if (blockedIds.has(candidate.id)) return false
    if (swipedIds.has(candidate.id)) return false

    // Age/gender/distance filters only apply to the global-pool fallback.
    if (!hasFollows) {
      if (genderFilter !== "All" && candidate.gender !== genderFilter) return false

      const age = toAge(candidate.birthday)
      if (age === null || age < minAge || age > maxAge) return false

      if (
        currentUser.latitude !== null &&
        currentUser.longitude !== null &&
        candidate.latitude !== null &&
        candidate.longitude !== null
      ) {
        const distance = kmDistance(
          Number(currentUser.latitude),
          Number(currentUser.longitude),
          Number(candidate.latitude),
          Number(candidate.longitude),
        )
        if (distance > maxDistance) return false
      }
    }

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
      const videos = Array.isArray(serialized.gallery)
        ? (serialized.gallery as Array<Record<string, unknown>>)
        : []
      // Strip gallery from the user profile — the app only needs avatar/name,
      // not the full post list. Keeps the response payload small.
      const { gallery: _g, ...userProfile } = serialized
      return videos.map((video) => {
        const id = String(video.id || "")
        const createdAt = new Date(String(video.createdAt || now))
        return {
          user: userProfile,
          video,
          _seen: id ? seenMediaIds.has(id) : false,
          _createdAt: createdAt.getTime(),
        }
      })
    })
    .flat()

  // Discover is "following + fresh": people you follow (when hasFollows the
  // candidate pool is already follow-scoped) surfaced newest-first, with
  // unseen posts ahead of seen ones. It is ordered purely by recency and NEVER
  // by engagement/hotScore, so it stays visibly different from the Trending
  // tab (which ranks by the hot-score algorithm).
  entries.sort((a, b) => {
    if (a._seen !== b._seen) return a._seen ? 1 : -1
    return b._createdAt - a._createdAt
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
      const videos = Array.isArray(serialized.gallery)
        ? (serialized.gallery as Array<Record<string, unknown>>)
        : []
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
