import "server-only"

import { Prisma } from "@prisma/client"
import { sendPaymentNotification } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"
import { emitChatRealtimeToUser } from "@/lib/realtime"

type CreateWalletTransactionInput = {
  userId: string
  amount: number
  type: string
  senderId: string
  receiverId: string
  senderName: string
  receiverName: string
  transactionId: string
  metadata?: Record<string, unknown>
  date?: Date
}

type CreateWithdrawalInput = {
  userId: string
  amount: number
  method: string
  destination: string
  status?: string
  metadata?: Record<string, unknown>
}

function toJsonValue(value?: Record<string, unknown>) {
  return value as Prisma.InputJsonValue | undefined
}

export async function getUserDisplayName(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true },
  })

  return user?.fullName || "Unknown"
}

async function getUserContact(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true, email: true, phoneNumber: true },
  })
}

export function serializeWalletTransaction(tx: {
  id: string
  transactionId: string
  amount: unknown
  type: string
  senderId: string | null
  receiverId: string | null
  senderName: string | null
  receiverName: string | null
  date: Date
  metadata: unknown
}) {
  return {
    id: tx.id,
    transactionId: tx.transactionId,
    amount: Number(tx.amount),
    type: tx.type,
    senderId: tx.senderId || "",
    receiverId: tx.receiverId || "",
    senderName: tx.senderName || "Unknown",
    receiverName: tx.receiverName || "Unknown",
    date: tx.date.toISOString(),
    metadata: tx.metadata,
  }
}

export function serializeWithdrawal(withdrawal: {
  id: string
  userId: string
  amount: unknown
  method: string
  destination: string
  status: string
  metadata: unknown
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: withdrawal.id,
    userId: withdrawal.userId,
    amount: Number(withdrawal.amount),
    method: withdrawal.method,
    destination: withdrawal.destination,
    status: withdrawal.status,
    metadata: withdrawal.metadata,
    date: withdrawal.createdAt.toISOString(),
    updatedAt: withdrawal.updatedAt.toISOString(),
  }
}

export async function getWalletTransactions(userId: string) {
  const transactions = await prisma.walletTransaction.findMany({
    where: { userId },
    orderBy: { date: "desc" },
  })

  return transactions.map(serializeWalletTransaction)
}

export async function createWalletTransaction(input: CreateWalletTransactionInput) {
  const transaction = await prisma.walletTransaction.create({
    data: {
      userId: input.userId,
      amount: input.amount,
      type: input.type,
      senderId: input.senderId,
      receiverId: input.receiverId,
      senderName: input.senderName,
      receiverName: input.receiverName,
      transactionId: input.transactionId,
      metadata: toJsonValue(input.metadata),
      date: input.date ?? new Date(),
    },
  })

  const serialized = serializeWalletTransaction(transaction)
  emitChatRealtimeToUser(input.userId, {
    channel: "wallet",
    type: "wallet_transaction_created",
    data: serialized,
  })
  emitChatRealtimeToUser(input.userId, {
    channel: "wallet",
    type: "wallet_refresh",
    refreshedAt: new Date().toISOString(),
  })
  return serialized
}

export async function getUserWithdrawals(userId: string) {
  const withdrawals = await prisma.withdrawalRequest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  })

  return withdrawals.map(serializeWithdrawal)
}

export async function createWithdrawalRequest(input: CreateWithdrawalInput) {
  const withdrawal = await prisma.withdrawalRequest.create({
    data: {
      userId: input.userId,
      amount: input.amount,
      method: input.method,
      destination: input.destination,
      status: input.status || "pending",
      metadata: toJsonValue(input.metadata),
    },
  })

  const serialized = serializeWithdrawal(withdrawal)
  emitChatRealtimeToUser(input.userId, {
    channel: "wallet",
    type: "withdrawal_created",
    data: serialized,
  })
  emitChatRealtimeToUser(input.userId, {
    channel: "wallet",
    type: "wallet_refresh",
    refreshedAt: new Date().toISOString(),
  })
  return serialized
}

export async function settleSuccessfulStkWalletTopUp(input: {
  merchantRequestID?: string
  checkoutRequestID?: string
  userId?: string
}) {
  const request = await prisma.mpesaPaymentRequest.findFirst({
    where: {
      OR: [
        input.merchantRequestID ? { merchantRequestId: input.merchantRequestID } : undefined,
        input.checkoutRequestID ? { checkoutRequestId: input.checkoutRequestID } : undefined,
      ].filter(Boolean) as Array<{ merchantRequestId?: string; checkoutRequestId?: string }>,
    },
  })

  if (!request || request.status !== "SUCCESS") {
    return { settled: false, transaction: null }
  }

  const userId = input.userId || request.userId
  if (!userId) {
    return { settled: false, transaction: null }
  }

  const existing = await prisma.walletTransaction.findUnique({
    where: { transactionId: request.merchantRequestId || request.checkoutRequestId || request.id },
  })

  if (existing) {
    return { settled: false, transaction: serializeWalletTransaction(existing) }
  }

  const userName = await getUserDisplayName(userId)
  const transaction = await prisma.walletTransaction.create({
    data: {
      userId,
      amount: request.amount,
      type: "credit",
      senderId: "mpesa",
      receiverId: userId,
      senderName: "M-PESA",
      receiverName: userName,
      transactionId: request.merchantRequestId || request.checkoutRequestId || request.id,
      metadata: {
        source: "mpesa-stk",
        merchantRequestID: request.merchantRequestId,
        checkoutRequestID: request.checkoutRequestId,
      },
      date: new Date(),
    },
  })

  const contact = await getUserContact(userId)
  if (contact) {
    await sendPaymentNotification({
      email: contact.email,
      phone: contact.phoneNumber,
      fullName: contact.fullName,
      amount: Number(request.amount),
      currency: "KES",
      reference: request.merchantRequestId || request.checkoutRequestId || request.id,
      subject: "Wallet top-up confirmation",
      message: `ChatAndTip: Hello ${contact.fullName || "User"}, your wallet top-up of KES ${Number(request.amount).toFixed(
        2,
      )} has been received.`,
    })
  }

  const serialized = serializeWalletTransaction(transaction)
  emitChatRealtimeToUser(userId, {
    channel: "wallet",
    type: "wallet_transaction_created",
    data: serialized,
  })
  emitChatRealtimeToUser(userId, {
    channel: "wallet",
    type: "wallet_refresh",
    refreshedAt: new Date().toISOString(),
  })

  return { settled: true, transaction: serialized }
}
