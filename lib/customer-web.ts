import "server-only"

import { BookingType, MediaKind, UserRole } from "@prisma/client"
import { getCustomerSession } from "@/lib/customer-auth"
import { getCreditBalances } from "@/lib/mobile-credits"
import { getComments } from "@/lib/mobile-comments"
import { availableSlots } from "@/lib/mobile-bookings"
import { getDiscoverFeed } from "@/lib/mobile-discover"
import { financeSummary } from "@/lib/mobile-finance"
import { listUserNotifications } from "@/lib/mobile-notifications"
import { findMobileUserById, serializeMobileUserWithCounts } from "@/lib/mobile-users"
import { prisma } from "@/lib/prisma"

export type CustomerUser = Awaited<ReturnType<typeof getCurrentCustomerUser>>
export type CustomerFeedEntry = {
  user: {
    userId: string
    fullname: string | null
    username: string
    profileAvatarUrl: string
    bio?: string
    followersCount?: number
    followingCount?: number
    verified?: number
    isBroadcaster?: boolean
  }
  video: {
    id: string
    videoUrl: string
    imageUrl: string
    images: string[]
    thumbnailUrl: string
    title: string
    caption: string
    description: string
    views: number
    likes: number
    commentCount: number
    createdAt: string | null
    isLiked?: boolean
  }
}

export async function getCurrentCustomerUser() {
  const session = await getCustomerSession()
  if (!session?.userId) return null
  const user = await findMobileUserById(session.userId)
  return user ? await serializeMobileUserWithCounts(user) : null
}

export async function getCustomerHomeFeed(currentUserId?: string | null): Promise<CustomerFeedEntry[]> {
  if (currentUserId) {
    try {
      return await getDiscoverFeed(currentUserId) as unknown as CustomerFeedEntry[]
    } catch {
      // Fall through to the public recent feed if the personalized feed cannot
      // load yet, for example before a staging migration or profile setup.
    }
  }
  return getPublicFeed("recent")
}

export async function getPublicFeed(mode: "recent" | "trending" = "recent"): Promise<CustomerFeedEntry[]> {
  try {
    const media = await prisma.userMedia.findMany({
      where: {
        kind: { in: [MediaKind.GALLERY_VIDEO, MediaKind.IMAGE] },
        user: {
          role: UserRole.USER,
          isActive: true,
          status: { notIn: ["BLOCKED", "HIDDEN"] },
        },
      },
      include: { user: { include: { media: true } } },
      orderBy: mode === "trending"
        ? [{ likes: "desc" }, { commentCount: "desc" }, { views: "desc" }, { createdAt: "desc" }]
        : [{ createdAt: "desc" }],
      take: 40,
    })

    const seenUsers = new Map<string, Awaited<ReturnType<typeof serializeMobileUserWithCounts>>>()
    const entries: CustomerFeedEntry[] = []
    for (const item of media) {
      let user = seenUsers.get(item.userId)
      if (!user) {
        user = await serializeMobileUserWithCounts(item.user)
        seenUsers.set(item.userId, user)
      }
      const galleryItem = user.gallery.find((post) => post.id === item.id)
      if (galleryItem) entries.push({ user, video: galleryItem } as CustomerFeedEntry)
    }
    return entries
  } catch {
    return []
  }
}

export async function getCustomerProfile(profileId: string) {
  try {
    const user = await prisma.user.findFirst({
      where: {
        id: profileId,
        role: UserRole.USER,
        isActive: true,
        status: { notIn: ["BLOCKED", "HIDDEN"] },
      },
      include: { media: true },
    })
    return user ? await serializeMobileUserWithCounts(user) : null
  } catch {
    return null
  }
}

export async function getCustomerMedia(mediaId: string, viewerId?: string | null) {
  try {
    const media = await prisma.userMedia.findUnique({
      where: { id: mediaId },
      include: { user: { include: { media: true } } },
    })
    if (!media || !media.user.isActive || ["BLOCKED", "HIDDEN"].includes(media.user.status)) return null
    const user = await serializeMobileUserWithCounts(media.user)
    const post = media.kind === MediaKind.PROFILE_VIDEO
      ? user.profileVideo
      : user.gallery.find((item) => item.id === media.id)
    if (!post) return null
    const [commentData, likedRow, followRow] = await Promise.all([
      viewerId ? getComments(media.id, viewerId).catch(() => ({ comments: [], nextCursor: null })) : Promise.resolve({ comments: [], nextCursor: null }),
      viewerId ? prisma.videoLike.findUnique({ where: { senderId_mediaId: { senderId: viewerId, mediaId: media.id } }, select: { id: true } }).catch(() => null) : null,
      viewerId && viewerId !== media.userId ? prisma.follow.findUnique({ where: { followerId_followedId: { followerId: viewerId, followedId: media.userId } }, select: { id: true } }).catch(() => null) : null,
    ])
    return {
      user,
      video: { ...post, isLiked: Boolean(likedRow) },
      comments: commentData.comments,
      following: Boolean(followRow),
    }
  } catch {
    return null
  }
}

export async function getCustomerWallet(userId: string) {
  try {
    const [balances, finance, creditLedger, earningLots, payouts] = await Promise.all([
      getCreditBalances(userId),
      financeSummary(userId),
      prisma.creditLedger.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, kind: true, entryType: true, quantity: true, value: true, currency: true, createdAt: true },
      }),
      prisma.earningLot.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, source: true, amount: true, currency: true, status: true, availableAt: true, createdAt: true, heldReason: true },
      }),
      prisma.creatorPayout.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, amount: true, currency: true, status: true, destination: true, failureReason: true, createdAt: true, processedAt: true },
      }),
    ])
    return { balances, finance, creditLedger, earningLots, payouts }
  } catch {
    return {
      balances: { keys: 0, chatCredits: 0, voiceSessions: 0, videoSessions: 0 },
      finance: {
        pendingEarningsKes: 0,
        availableBalanceKes: 0,
        currentBalanceKes: 0,
        totalPaidOutKes: 0,
        usdToKesRate: 0,
        kycStatus: "NOT_SUBMITTED",
        payoutProfile: null,
      },
      creditLedger: [],
      earningLots: [],
      payouts: [],
    }
  }
}

export async function getCustomerNotifications(userId: string) {
  try {
    return await listUserNotifications({ userId, page: 1, limit: 50 })
  } catch {
    return { data: [], page: 1, limit: 50, hasMore: false, total: 0 }
  }
}

export async function getCustomerChats(userId: string) {
  try {
    const { getChats } = await import("@/lib/mobile-chats")
    return await getChats(userId)
  } catch {
    return []
  }
}

export async function getCustomerBookings(userId: string) {
  try {
    return await prisma.callBooking.findMany({
      where: { OR: [{ customerId: userId }, { creatorId: userId }] },
      include: {
        customer: { select: { id: true, fullName: true, avatarUrl: true, email: true, phoneNumber: true } },
        creator: { select: { id: true, fullName: true, avatarUrl: true, email: true, phoneNumber: true } },
      },
      orderBy: { scheduledStart: "desc" },
      take: 100,
    })
  } catch {
    return []
  }
}

export async function getCustomerBooking(userId: string, bookingId: string) {
  try {
    return await prisma.callBooking.findFirst({
      where: {
        id: bookingId,
        OR: [{ customerId: userId }, { creatorId: userId }],
      },
      include: {
        customer: { select: { id: true, fullName: true, avatarUrl: true, email: true, phoneNumber: true } },
        creator: { select: { id: true, fullName: true, avatarUrl: true, email: true, phoneNumber: true } },
      },
    })
  } catch {
    return null
  }
}

export async function getCustomerAvailability(userId: string) {
  try {
    return await prisma.creatorAvailability.findMany({
      where: { userId, isActive: true },
      orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
    })
  } catch {
    return []
  }
}

export async function getCustomerBookingSlots(creatorId: string, type: BookingType) {
  try {
    return await availableSlots(creatorId, type)
  } catch {
    return []
  }
}

export function mediaTargetFromNotification(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null
  const data = metadata as Record<string, unknown>
  const mediaId = data.mediaId || data.videoId
  return typeof mediaId === "string" && mediaId ? `/reels/${mediaId}` : null
}
