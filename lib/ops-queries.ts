import "server-only"

import { Prisma, UserRole, VerificationPurpose } from "@prisma/client"
import { prisma } from "@/lib/prisma"

function bytesToNumber(value: number | bigint | null | undefined) {
  return Number(value ?? 0)
}

export async function getChatThreadsAdmin(params: { query?: string }) {
  const query = params.query?.trim()

  const threads = await prisma.chatThread.findMany({
    where: query
      ? {
          participants: {
            some: {
              user: {
                role: UserRole.USER,
                OR: [
                  { fullName: { contains: query } },
                  { email: { contains: query } },
                  { phoneNumber: { contains: query } },
                ],
              },
            },
          },
        }
      : undefined,
    include: {
      participants: {
        include: {
          user: {
            include: { media: true },
          },
        },
      },
      messages: {
        orderBy: { sentAt: "desc" },
        take: 1,
      },
      _count: {
        select: { messages: true },
      },
    },
    orderBy: { lastMessageAt: "desc" },
  })

  const items = threads.map((thread) => {
    const participants = thread.participants
      .filter((participant) => participant.user.role === UserRole.USER)
      .map((participant) => ({
        id: participant.user.id,
        fullName: participant.user.fullName,
        email: participant.user.email,
        phoneNumber: participant.user.phoneNumber,
        avatarUrl:
          participant.user.avatarUrl ||
          participant.user.media.find((media) => media.kind === "PROFILE_VIDEO")?.thumbnailUrl ||
          "",
        unreadCount: participant.unreadCount,
        archived: participant.archived,
      }))

    const lastMessage = thread.messages[0] ?? null
    const unreadCount = thread.participants.reduce((sum, participant) => sum + participant.unreadCount, 0)

    return {
      id: thread.id,
      participants,
      messageCount: thread._count.messages,
      unreadCount,
      archivedCount: thread.participants.filter((participant) => participant.archived).length,
      lastMessageText: thread.lastMessageText || lastMessage?.text || "",
      lastMessageType: (thread.lastMessageType || lastMessage?.type || "TEXT").toLowerCase(),
      lastMessageAt: thread.lastMessageAt || lastMessage?.sentAt || thread.updatedAt,
      updatedAt: thread.updatedAt,
    }
  })

  const [messageAgg, unreadAgg] = await Promise.all([
    prisma.chatMessage.aggregate({
      _count: true,
    }),
    prisma.chatParticipant.aggregate({
      _sum: { unreadCount: true },
    }),
  ])

  return {
    items,
    summary: {
      activeThreads: items.filter((thread) => thread.messageCount > 0).length,
      totalMessages: messageAgg._count,
      unreadMessages: unreadAgg._sum.unreadCount ?? 0,
      imageMessages: await prisma.chatMessage.count({
        where: { type: "IMAGE" },
      }),
    },
  }
}

export async function getChatThreadDetail(threadId: string) {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: {
      participants: {
        include: {
          user: {
            include: { media: true },
          },
        },
      },
      messages: {
        include: {
          sender: {
            include: { media: true },
          },
        },
        orderBy: { sentAt: "asc" },
      },
    },
  })

  if (!thread) return null

  const participants = thread.participants
    .filter((participant) => participant.user.role === UserRole.USER)
    .map((participant) => ({
      id: participant.user.id,
      fullName: participant.user.fullName,
      email: participant.user.email,
      phoneNumber: participant.user.phoneNumber,
      unreadCount: participant.unreadCount,
      archived: participant.archived,
      avatarUrl:
        participant.user.avatarUrl ||
        participant.user.media.find((media) => media.kind === "PROFILE_VIDEO")?.thumbnailUrl ||
        "",
    }))

  const messages = thread.messages.map((message) => ({
    id: message.id,
    type: message.type.toLowerCase(),
    text: message.text || "",
    imageUrl: message.imageUrl,
    isRead: message.isRead,
    sentAt: message.sentAt,
    sender: {
      id: message.sender.id,
      fullName: message.sender.fullName,
    },
  }))

  return {
    id: thread.id,
    participants,
    messages,
    summary: {
      messageCount: messages.length,
      imageCount: messages.filter((message) => message.type === "image").length,
      unreadCount: participants.reduce((sum, participant) => sum + participant.unreadCount, 0),
      archivedCount: participants.filter((participant) => participant.archived).length,
    },
  }
}

export async function getAssetsAdmin(params: { query?: string }) {
  const query = params.query?.trim()

  const assets = await prisma.asset.findMany({
    where: query
      ? {
          OR: [
            { name: { contains: query } },
            { objectKey: { contains: query } },
            { contentType: { contains: query } },
            { bucket: { contains: query } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
  })

  const objectKeys = assets.map((asset) => asset.objectKey)
  const linkedMedia = objectKeys.length
    ? await prisma.userMedia.findMany({
        where: { objectKey: { in: objectKeys } },
        select: {
          objectKey: true,
          kind: true,
          user: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      })
    : []

  const linkedMap = new Map(
    linkedMedia.map((item) => [
      item.objectKey,
      {
        userId: item.user.id,
        fullName: item.user.fullName,
        kind: item.kind,
      },
    ]),
  )

  const items = assets.map((asset) => {
    const linked = linkedMap.get(asset.objectKey)
    return {
      ...asset,
      isLinked: Boolean(linked),
      linkedUserId: linked?.userId ?? null,
      linkedUserName: linked?.fullName ?? null,
      linkedKind: linked?.kind ?? null,
    }
  })

  const totalBytes = items.reduce((sum, asset) => sum + bytesToNumber(asset.sizeBytes), 0)

  return {
    items,
    summary: {
      totalAssets: items.length,
      totalBytes,
      linkedAssets: items.filter((asset) => asset.isLinked).length,
      orphanAssets: items.filter((asset) => !asset.isLinked).length,
    },
  }
}

export async function getVerificationLogsAdmin(params: {
  query?: string
  purpose?: string
}) {
  const query = params.query?.trim()
  const purpose =
    params.purpose && params.purpose !== "ALL"
      ? (params.purpose as VerificationPurpose)
      : undefined

  const logs = await prisma.verificationCode.findMany({
    where: {
      ...(purpose ? { purpose } : {}),
      ...(query
        ? {
            OR: [
              { recipient: { contains: query } },
              { user: { fullName: { contains: query } } },
              { user: { email: { contains: query } } },
              { user: { phoneNumber: { contains: query } } },
            ],
          }
        : {}),
    },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phoneNumber: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  const now = new Date()
  const items = logs.map((log) => {
    const state =
      log.consumedAt
        ? "consumed"
        : log.expiresAt <= now
          ? "expired"
          : "active"

    return {
      ...log,
      state,
    }
  })

  return {
    items,
    summary: {
      total: items.length,
      active: items.filter((item) => item.state === "active").length,
      consumed: items.filter((item) => item.state === "consumed").length,
      expired: items.filter((item) => item.state === "expired").length,
    },
  }
}
