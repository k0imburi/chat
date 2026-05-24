import "server-only"

import { TipRequestStatus } from "@prisma/client"
import { createUserNotification } from "@/lib/mobile-notifications"
import { prisma } from "@/lib/prisma"
import { emitChatRealtimeToUser } from "@/lib/realtime"

export function serializeTipRequest(request: {
  id: string
  senderId: string
  receiverId: string
  amount: unknown
  status: TipRequestStatus
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: request.id,
    senderId: request.senderId,
    receiverId: request.receiverId,
    amount: Number(request.amount),
    status: request.status.toLowerCase(),
    timestamp: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  }
}

export async function hasPendingTipRequest(userId: string, senderId: string) {
  const request = await prisma.tipRequest.findFirst({
    where: {
      receiverId: userId,
      senderId,
      status: TipRequestStatus.PENDING,
    },
    orderBy: { createdAt: "desc" },
  })

  return {
    hasPendingTip: Boolean(request),
    amount: request ? Number(request.amount) : 0,
    tipRequestId: request?.id || "",
  }
}

export async function sendTipRequest(input: {
  senderId: string
  receiverId: string
  amount: number
}) {
  const request = await prisma.tipRequest.create({
    data: {
      senderId: input.senderId,
      receiverId: input.receiverId,
      amount: input.amount,
      status: TipRequestStatus.PENDING,
    },
  })

  const sender = await prisma.user.findUnique({
    where: { id: input.senderId },
    select: { fullName: true },
  })

  await createUserNotification({
    userId: input.receiverId,
    senderId: input.senderId,
    title: "Tip request",
    message: `${sender?.fullName?.split(" ").at(0) || "Someone"} requested a tip`,
    type: "tip_request",
    metadata: {
      tipRequestId: request.id,
      amount: input.amount,
    },
  })

  const serialized = serializeTipRequest(request)
  emitChatRealtimeToUser(input.senderId, {
    channel: "tip_requests",
    type: "tip_request_created",
    otherUserId: input.receiverId,
    data: serialized,
  })
  emitChatRealtimeToUser(input.receiverId, {
    channel: "tip_requests",
    type: "tip_request_created",
    otherUserId: input.senderId,
    data: serialized,
  })

  return serialized
}

export async function getTipRequests(userId: string) {
  const requests = await prisma.tipRequest.findMany({
    where: { receiverId: userId },
    orderBy: { createdAt: "desc" },
  })

  return requests.map(serializeTipRequest)
}

export async function markTipAsSent(receiverId: string, tipRequestId: string) {
  const existing = await prisma.tipRequest.findUnique({
    where: { id: tipRequestId },
    select: { receiverId: true },
  })

  if (!existing || existing.receiverId !== receiverId) {
    throw new Error("Tip request not found")
  }

  const request = await prisma.tipRequest.update({
    where: { id: tipRequestId },
    data: {
      status: TipRequestStatus.SENT,
    },
  })

  const serialized = serializeTipRequest(request)
  emitChatRealtimeToUser(request.senderId, {
    channel: "tip_requests",
    type: "tip_request_updated",
    otherUserId: request.receiverId,
    data: serialized,
  })
  emitChatRealtimeToUser(request.receiverId, {
    channel: "tip_requests",
    type: "tip_request_updated",
    otherUserId: request.senderId,
    data: serialized,
  })
  return serialized
}

export async function completePendingTipRequests(userId: string, senderId: string) {
  const requests = await prisma.tipRequest.findMany({
    where: {
      receiverId: userId,
      senderId,
      status: TipRequestStatus.PENDING,
    },
  })

  if (!requests.length) {
    return { updated: 0 }
  }

  const ids = requests.map((request) => request.id)
  const result = await prisma.tipRequest.updateMany({
    where: {
      id: { in: ids },
    },
    data: {
      status: TipRequestStatus.COMPLETED,
    },
  })

  const updatedRequests = await prisma.tipRequest.findMany({
    where: {
      id: { in: ids },
    },
  })

  for (const request of updatedRequests) {
    const serialized = serializeTipRequest(request)
    emitChatRealtimeToUser(request.senderId, {
      channel: "tip_requests",
      type: "tip_request_updated",
      otherUserId: request.receiverId,
      data: serialized,
    })
    emitChatRealtimeToUser(request.receiverId, {
      channel: "tip_requests",
      type: "tip_request_updated",
      otherUserId: request.senderId,
      data: serialized,
    })
  }

  return { updated: result.count }
}
