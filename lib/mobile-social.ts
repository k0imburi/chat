import "server-only"

import { Prisma, SwipeDirection, UserRole, UserStatus } from "@prisma/client"
import { createUserNotification } from "@/lib/mobile-notifications"
import { prisma } from "@/lib/prisma"
import { serializeMobileUser } from "@/lib/mobile-users"

type UserWithMedia = Prisma.UserGetPayload<{
  include: { media: true }
}>

function assertNotSameUser(userId1: string, userId2: string, action: string) {
  if (userId1 === userId2) {
    throw new Error(`You cannot ${action} yourself`)
  }
}

async function getMobileUserOrThrow(userId: string) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      role: UserRole.USER,
    },
    include: { media: true },
  })

  if (!user) {
    throw new Error("User not found")
  }

  return user as UserWithMedia
}

function normalizeMatchPair(userId1: string, userId2: string) {
  return userId1 < userId2
    ? { userAId: userId1, userBId: userId2, currentSide: "A" as const }
    : { userAId: userId2, userBId: userId1, currentSide: "B" as const }
}

function toSocialEntry(user: UserWithMedia, options: { isNew?: boolean; createdAt?: Date | null }) {
  return {
    userId: user.id,
    isNew: options.isNew ?? false,
    createdAt: options.createdAt?.toISOString() ?? null,
    user: serializeMobileUser(user),
  }
}

async function getUsersByIds(userIds: string[]) {
  if (userIds.length === 0) return []

  const users = await prisma.user.findMany({
    where: {
      id: { in: userIds },
      role: UserRole.USER,
    },
    include: { media: true },
  })

  const byId = new Map(users.map((user) => [user.id, user as UserWithMedia]))
  return userIds.map((id) => byId.get(id)).filter(Boolean) as UserWithMedia[]
}

export async function toggleVideoLike(input: {
  currentUserId: string
  ownerId: string
  videoId: string
}) {
  assertNotSameUser(input.currentUserId, input.ownerId, "like")

  await Promise.all([
    getMobileUserOrThrow(input.currentUserId),
    getMobileUserOrThrow(input.ownerId),
  ])

  const result = await prisma.$transaction(async (tx) => {
    const media = await tx.userMedia.findFirst({
      where: {
        id: input.videoId,
        userId: input.ownerId,
      },
    })

    if (!media) {
      throw new Error("Video not found")
    }

    const existingLike = await tx.videoLike.findFirst({
      where: {
        senderId: input.currentUserId,
        receiverId: input.ownerId,
        mediaId: input.videoId,
      },
    })

    if (existingLike) {
      await tx.videoLike.delete({
        where: { id: existingLike.id },
      })

      await tx.userMedia.update({
        where: { id: media.id },
        data: { likes: { decrement: media.likes > 0 ? 1 : 0 } },
      })

      return {
        liked: false,
        isMatch: false,
      }
    }

    await tx.videoLike.create({
      data: {
        senderId: input.currentUserId,
        receiverId: input.ownerId,
        mediaId: input.videoId,
        isNew: true,
      },
    })

    await tx.userMedia.update({
      where: { id: media.id },
      data: { likes: { increment: 1 } },
    })

    const reciprocalLike = await tx.videoLike.findFirst({
      where: {
        senderId: input.ownerId,
        receiverId: input.currentUserId,
      },
    })

    let isMatch = false

    if (reciprocalLike) {
      const normalized = normalizeMatchPair(input.currentUserId, input.ownerId)
      const existingMatch = await tx.userMatch.findFirst({
        where: {
          userAId: normalized.userAId,
          userBId: normalized.userBId,
        },
      })

      if (!existingMatch) {
        await tx.userMatch.create({
          data: {
            userAId: normalized.userAId,
            userBId: normalized.userBId,
            isNewForA: true,
            isNewForB: true,
          },
        })
      }

      isMatch = true
    }

    return {
      liked: true,
      isMatch,
    }
  })

  if (result.liked) {
    const sender = await prisma.user.findUnique({
      where: { id: input.currentUserId },
      select: { fullName: true },
    })

    await createUserNotification({
      userId: input.ownerId,
      senderId: input.currentUserId,
      title: sender?.fullName?.split(" ").at(0) || "Someone",
      message: "liked your video",
      type: "like",
    })

    if (result.isMatch) {
      const senderName = sender?.fullName?.split(" ").at(0) || "Someone"
      const owner = await prisma.user.findUnique({
        where: { id: input.ownerId },
        select: { fullName: true },
      })

      await Promise.all([
        createUserNotification({
          userId: input.currentUserId,
          senderId: input.ownerId,
          title: owner?.fullName?.split(" ").at(0) || "Someone",
          message: "You got a match. Open the app to chat now!",
          type: "match",
        }),
        createUserNotification({
          userId: input.ownerId,
          senderId: input.currentUserId,
          title: senderName,
          message: "You got a match. Open the app to chat now!",
          type: "match",
        }),
      ])
    }
  }

  return result
}

export async function getReceivedLikes(userId: string) {
  await getMobileUserOrThrow(userId)

  const likes = await prisma.videoLike.findMany({
    where: { receiverId: userId },
    include: {
      sender: {
        include: { media: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  const grouped = new Map<string, { user: UserWithMedia; createdAt: Date; isNew: boolean }>()

  for (const like of likes) {
    const existing = grouped.get(like.senderId)
    if (!existing) {
      grouped.set(like.senderId, {
        user: like.sender as UserWithMedia,
        createdAt: like.createdAt,
        isNew: like.isNew,
      })
      continue
    }

    if (like.isNew) {
      existing.isNew = true
    }
  }

  return Array.from(grouped.values()).map((entry) =>
    toSocialEntry(entry.user, { isNew: entry.isNew, createdAt: entry.createdAt }),
  )
}

export async function markLikeViewed(receiverId: string, senderId: string) {
  await prisma.videoLike.updateMany({
    where: {
      receiverId,
      senderId,
      isNew: true,
    },
    data: {
      isNew: false,
    },
  })

  return { success: true }
}

export async function getLikedVideoIds(userId: string) {
  const likes = await prisma.videoLike.findMany({
    where: {
      senderId: userId,
      mediaId: { not: null },
    },
    select: {
      mediaId: true,
    },
  })

  return likes.map((item) => item.mediaId).filter(Boolean)
}

export async function getMatches(userId: string) {
  await getMobileUserOrThrow(userId)

  const matches = await prisma.userMatch.findMany({
    where: {
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    include: {
      userA: { include: { media: true } },
      userB: { include: { media: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return matches.map((match) => {
    const isCurrentA = match.userAId === userId
    const otherUser = (isCurrentA ? match.userB : match.userA) as UserWithMedia

    return toSocialEntry(otherUser, {
      isNew: isCurrentA ? match.isNewForA : match.isNewForB,
      createdAt: match.createdAt,
    })
  })
}

export async function markMatchViewed(userId: string, otherUserId: string) {
  const normalized = normalizeMatchPair(userId, otherUserId)
  const match = await prisma.userMatch.findFirst({
    where: {
      userAId: normalized.userAId,
      userBId: normalized.userBId,
    },
  })

  if (!match) {
    return { success: true }
  }

  await prisma.userMatch.update({
    where: { id: match.id },
    data: normalized.currentSide === "A" ? { isNewForA: false } : { isNewForB: false },
  })

  return { success: true }
}

export async function deleteMatch(userId: string, otherUserId: string) {
  const normalized = normalizeMatchPair(userId, otherUserId)
  const match = await prisma.userMatch.findFirst({
    where: {
      userAId: normalized.userAId,
      userBId: normalized.userBId,
    },
  })

  if (!match) {
    return { success: true }
  }

  await prisma.userMatch.delete({
    where: { id: match.id },
  })

  return { success: true }
}

export async function saveSwipe(input: {
  senderId: string
  receiverId: string
  direction?: SwipeDirection
}) {
  assertNotSameUser(input.senderId, input.receiverId, "swipe")

  await Promise.all([
    getMobileUserOrThrow(input.senderId),
    getMobileUserOrThrow(input.receiverId),
  ])

  const existing = await prisma.userSwipe.findFirst({
    where: {
      senderId: input.senderId,
      receiverId: input.receiverId,
    },
  })

  if (existing) {
    return prisma.userSwipe.update({
      where: { id: existing.id },
      data: {
        direction: input.direction ?? SwipeDirection.RIGHT,
        createdAt: new Date(),
      },
    })
  }

  return prisma.userSwipe.create({
    data: {
      senderId: input.senderId,
      receiverId: input.receiverId,
      direction: input.direction ?? SwipeDirection.RIGHT,
    },
  })
}

export async function getSwipedUsers(userId: string) {
  const swipes = await prisma.userSwipe.findMany({
    where: {
      senderId: userId,
    },
    orderBy: { createdAt: "desc" },
  })

  return swipes.map((swipe) => ({
    userId: swipe.receiverId,
    direction: swipe.direction,
    createdAt: swipe.createdAt.toISOString(),
  }))
}

export async function blockUser(currentUserId: string, otherUserId: string) {
  assertNotSameUser(currentUserId, otherUserId, "block")

  await Promise.all([
    getMobileUserOrThrow(currentUserId),
    getMobileUserOrThrow(otherUserId),
  ])

  await prisma.$transaction(async (tx) => {
    const existingBlock = await tx.userBlock.findFirst({
      where: {
        blockerId: currentUserId,
        blockedId: otherUserId,
      },
    })

    if (!existingBlock) {
      await tx.userBlock.create({
        data: {
          blockerId: currentUserId,
          blockedId: otherUserId,
        },
      })
    }

    await tx.follow.deleteMany({
      where: {
        OR: [
          { followerId: currentUserId, followedId: otherUserId },
          { followerId: otherUserId, followedId: currentUserId },
        ],
      },
    })

    await tx.videoLike.deleteMany({
      where: {
        OR: [
          { senderId: currentUserId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: currentUserId },
        ],
      },
    })

    const normalized = normalizeMatchPair(currentUserId, otherUserId)
    await tx.userMatch.deleteMany({
      where: {
        userAId: normalized.userAId,
        userBId: normalized.userBId,
      },
    })
  })

  return { success: true }
}

export async function unblockUser(currentUserId: string, otherUserId: string) {
  await prisma.userBlock.deleteMany({
    where: {
      blockerId: currentUserId,
      blockedId: otherUserId,
    },
  })

  return { success: true }
}

export async function isBlocked(userId1: string, userId2: string) {
  const block = await prisma.userBlock.findFirst({
    where: {
      blockerId: userId1,
      blockedId: userId2,
    },
  })

  return { blocked: Boolean(block) }
}

export async function getBlockedUsers(userId: string) {
  const blocks = await prisma.userBlock.findMany({
    where: { blockerId: userId },
    include: {
      blocked: {
        include: { media: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  return blocks.map((block) =>
    toSocialEntry(block.blocked as UserWithMedia, { createdAt: block.createdAt }),
  )
}

export async function followUser(input: {
  followerId: string
  followedId: string
  follow: boolean
}) {
  assertNotSameUser(input.followerId, input.followedId, "follow")

  await Promise.all([
    getMobileUserOrThrow(input.followerId),
    getMobileUserOrThrow(input.followedId),
  ])

  const followId = {
    followerId_followedId: {
      followerId: input.followerId,
      followedId: input.followedId,
    },
  }

  if (input.follow) {
    await prisma.follow.upsert({
      where: followId,
      update: {},
      create: {
        followerId: input.followerId,
        followedId: input.followedId,
      },
    })
  } else {
    await prisma.follow.deleteMany({
      where: {
        followerId: input.followerId,
        followedId: input.followedId,
      },
    })
  }

  const [followersCount, followingCount] = await Promise.all([
    prisma.follow.count({ where: { followedId: input.followedId } }),
    prisma.follow.count({ where: { followerId: input.followerId } }),
  ])

  return {
    following: input.follow,
    followersCount,
    followingCount,
  }
}

export async function checkFollowStatus(followerId: string, followedId: string) {
  const follow = await prisma.follow.findUnique({
    where: {
      followerId_followedId: {
        followerId,
        followedId,
      },
    },
  })

  return { following: Boolean(follow) }
}

export async function getFollowers(userId: string) {
  const follows = await prisma.follow.findMany({
    where: { followedId: userId },
    orderBy: { createdAt: "desc" },
    select: { followerId: true },
  })

  const users = await getUsersByIds(follows.map((item) => item.followerId))
  return users.map((user) => serializeMobileUser(user))
}

export async function getFollowing(userId: string) {
  const follows = await prisma.follow.findMany({
    where: { followerId: userId },
    orderBy: { createdAt: "desc" },
    select: { followedId: true },
  })

  const users = await getUsersByIds(follows.map((item) => item.followedId))
  return users.map((user) => serializeMobileUser(user))
}

export async function getSuggestedFollowers(userId: string) {
  const [myFollowers, myFollowing, myBlocks, blockedBy] = await Promise.all([
    prisma.follow.findMany({
      where: { followedId: userId },
      select: { followerId: true },
    }),
    prisma.follow.findMany({
      where: { followerId: userId },
      select: { followedId: true },
    }),
    prisma.userBlock.findMany({
      where: { blockerId: userId },
      select: { blockedId: true },
    }),
    prisma.userBlock.findMany({
      where: { blockedId: userId },
      select: { blockerId: true },
    }),
  ])

  const followerIds = myFollowers.map((item) => item.followerId)
  const followingIds = new Set(myFollowing.map((item) => item.followedId))
  const blockedIds = new Set([
    ...myBlocks.map((item) => item.blockedId),
    ...blockedBy.map((item) => item.blockerId),
    userId,
  ])

  const mutualCandidates = followerIds.length
    ? await prisma.follow.findMany({
        where: {
          followerId: { in: followerIds.slice(0, 10) },
        },
        orderBy: { createdAt: "desc" },
        select: { followedId: true },
      })
    : []

  const candidateIds = Array.from(
    new Set(
      mutualCandidates
        .map((item) => item.followedId)
        .filter((id) => !followingIds.has(id) && !blockedIds.has(id)),
    ),
  )

  let users = await getUsersByIds(candidateIds)
  users = users.filter((user) => user.status !== UserStatus.BLOCKED && user.status !== UserStatus.HIDDEN)

  if (users.length === 0) {
    users = (await prisma.user.findMany({
      where: {
        id: {
          notIn: Array.from(blockedIds).concat(Array.from(followingIds)),
        },
        role: UserRole.USER,
        isActive: true,
        status: { notIn: [UserStatus.BLOCKED, UserStatus.HIDDEN] },
      },
      include: { media: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    })) as UserWithMedia[]
  }

  return users.slice(0, 10).map((user) => serializeMobileUser(user))
}

export async function getFollowCounts(userId: string) {
  const [followersCount, followingCount] = await Promise.all([
    prisma.follow.count({ where: { followedId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
  ])

  return {
    followersCount,
    followingCount,
  }
}
