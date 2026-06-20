import "server-only"

import { Prisma, UserRole } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { serializeMobileUserWithLikes } from "@/lib/mobile-users"
import { FEED_LIMIT, hotScore } from "@/lib/discover-score"

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
  const currentUser = await prisma.user.findUnique({
    where: { id: currentUserId },
    include: {
      media: true,
      blockedUsers: true,
      blockedByUsers: true,
      sentLikes: true,
      sentSwipes: true,
    },
  })
  if (!currentUser) {
    throw new Error("Current user not found")
  }

  // Posts this user has already seen — used to push fresh content first.
  const seenRows = await prisma.discoverSeen.findMany({
    where: { userId: currentUserId },
    select: { mediaId: true },
  })
  const seenMediaIds = new Set(seenRows.map((row) => row.mediaId))

  const userFilter = ((currentUser.filter as Prisma.JsonObject | null) ?? {}) as Record<string, unknown>
  const minAge = Number(userFilter.minAge ?? 18)
  const maxAge = Number(userFilter.maxAge ?? 100)
  const maxDistance = Number(userFilter.maxDistance ?? 100)
  const genderFilter = String(userFilter.gender ?? "All")

  const blockedIds = new Set<string>([
    ...currentUser.blockedUsers.map((item) => item.blockedId),
    ...currentUser.blockedByUsers.map((item) => item.blockerId),
  ])

  const likedMediaIds = new Set(
    currentUser.sentLikes.map((item) => item.mediaId).filter((value): value is string => Boolean(value)),
  )
  const swipedIds = new Set(currentUser.sentSwipes.map((item) => item.receiverId))

  const candidates = await prisma.user.findMany({
    where: {
      role: UserRole.USER,
      id: { not: currentUserId },
      status: { notIn: ["BLOCKED", "HIDDEN"] },
    },
    include: { media: true },
    orderBy: { createdAt: "desc" },
  })

  const filteredUsers = candidates.filter((candidate) => {
    if (blockedIds.has(candidate.id)) return false
    if (swipedIds.has(candidate.id)) return false
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

    // Keep anyone with at least one gallery post (video OR image).
    return candidate.media.some(
      (item) => item.kind === "GALLERY_VIDEO" || item.kind === "IMAGE",
    )
  })

  const now = Date.now()

  // Build one feed entry per gallery post, scored by the hot algorithm.
  const entries = filteredUsers
    .map((user) => {
      const serialized = serializeMobileUserWithLikes(user, likedMediaIds)
      const videos = Array.isArray(serialized.gallery)
        ? (serialized.gallery as Array<Record<string, unknown>>)
        : []
      return videos.map((video) => {
        const id = String(video.id || "")
        const createdAt = new Date(String(video.createdAt || now))
        const score = hotScore(
          Number(video.likes ?? 0),
          Number(video.commentCount ?? 0),
          Number(video.views ?? 0),
          createdAt,
          now,
        )
        return {
          user: serialized,
          video,
          _seen: id ? seenMediaIds.has(id) : false,
          _score: score,
        }
      })
    })
    .flat()

  // Unseen posts first (each group ranked by hot score), then seen posts as
  // a fallback so the feed never runs empty for active users.
  entries.sort((a, b) => {
    if (a._seen !== b._seen) return a._seen ? 1 : -1
    return b._score - a._score
  })

  // Strip internal scoring fields before returning.
  return entries
    .slice(0, FEED_LIMIT)
    .map(({ user, video }) => ({ user, video }))
}
