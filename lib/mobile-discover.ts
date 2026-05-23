import "server-only"

import { Prisma, UserRole } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { serializeMobileUserWithLikes } from "@/lib/mobile-users"

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

    return candidate.media.some((item) => item.kind === "GALLERY_VIDEO")
  })

  const feed = filteredUsers
    .map((user) => {
      const serialized = serializeMobileUserWithLikes(user, likedMediaIds)
      const videos = Array.isArray(serialized.gallery) ? (serialized.gallery as Array<Record<string, unknown>>) : []
      return videos.map((video) => ({
        user: serialized,
        video,
      }))
    })
    .flat()
    .sort((a, b) => {
      const dateA = Date.parse(String((a.video as Record<string, unknown>).createdAt || 0))
      const dateB = Date.parse(String((b.video as Record<string, unknown>).createdAt || 0))
      return dateB - dateA
    })

  return feed
}
