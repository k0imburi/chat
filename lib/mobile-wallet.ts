import "server-only"

import { Prisma } from "@prisma/client"
import { SignJWT, jwtVerify } from "jose"
import { env } from "@/lib/env"
import { sendPaymentNotification } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"
import { emitChatRealtimeToUser } from "@/lib/realtime"
import { calculateWithdrawalValues, roundUsd } from "@/lib/withdrawal-math"

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
  expectedRate?: number
  expectedFeePercent?: number
  quoteToken: string
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
  grossAmountUsd?: unknown
  feeAmountUsd?: unknown
  netAmountUsd?: unknown
  exchangeRate?: unknown
  netAmountKes?: unknown
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
  creatorPayoutId?: string | null
  amount: unknown
  method: string
  destination: string
  status: string
  metadata: unknown
  grossAmountUsd?: unknown
  feeAmountUsd?: unknown
  netAmountUsd?: unknown
  exchangeRate?: unknown
  netAmountKes?: unknown
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: withdrawal.id,
    userId: withdrawal.userId,
    creatorPayoutId: withdrawal.creatorPayoutId ?? null,
    amount: Number(withdrawal.amount),
    method: withdrawal.method,
    destination: withdrawal.destination,
    status: withdrawal.status,
    metadata: withdrawal.metadata,
    grossAmountUsd: withdrawal.grossAmountUsd == null ? null : Number(withdrawal.grossAmountUsd),
    feeAmountUsd: withdrawal.feeAmountUsd == null ? null : Number(withdrawal.feeAmountUsd),
    netAmountUsd: withdrawal.netAmountUsd == null ? null : Number(withdrawal.netAmountUsd),
    exchangeRate: withdrawal.exchangeRate == null ? null : Number(withdrawal.exchangeRate),
    netAmountKes: withdrawal.netAmountKes == null ? null : Number(withdrawal.netAmountKes),
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

/**
 * Reserve AVAILABLE earning lots (oldest first) to cover a withdrawal amount
 * (given in USD), converting each lot's own currency to KES at the current
 * rate — mirrors the reservation logic in runPayoutBatch() so the manual
 * withdraw flow and the automatic payout batch never double-spend the same
 * earnings.
 */
type WithdrawalDb = Prisma.TransactionClient | typeof prisma

const money = roundUsd
const quoteSecret = new TextEncoder().encode(env.JWT_SECRET)

export async function signWithdrawalQuote(input: {
  userId: string
  grossUsd: Prisma.Decimal
  rate: Prisma.Decimal
  feePercent: Prisma.Decimal
  expiresAt: Date
}) {
  return new SignJWT({
    userId: input.userId,
    grossUsd: input.grossUsd.toFixed(2),
    rate: input.rate.toFixed(2),
    feePercent: input.feePercent.toFixed(2),
    purpose: "withdrawal-quote",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(Math.floor(input.expiresAt.getTime() / 1000))
    .sign(quoteSecret)
}

async function verifyWithdrawalQuote(input: CreateWithdrawalInput) {
  const { payload } = await jwtVerify(input.quoteToken, quoteSecret)
  if (
    payload.purpose !== "withdrawal-quote"
    || payload.userId !== input.userId
    || !money(String(payload.grossUsd)).eq(input.amount)
    || !money(String(payload.rate)).eq(input.expectedRate ?? -1)
    || !money(String(payload.feePercent)).eq(input.expectedFeePercent ?? -1)
  ) {
    throw new Error("The withdrawal quote is no longer valid. Review the updated quote.")
  }
}

export async function getWithdrawalQuote(userId: string, grossUsdInput: number, db: WithdrawalDb = prisma) {
  const settings = await db.appSettings.findUnique({ where: { id: 1 } })
  const rate = money(settings?.usdToKesRate || 0)
  if (rate.lte(0)) throw new Error("Exchange rate is not configured")
  const feePercent = money(settings?.withdrawalFeePercent || 0)
  const values = calculateWithdrawalValues(grossUsdInput, feePercent, rate)
  const { grossUsd, feeUsd, netUsd, grossKes, netKes } = values

  const lots = await db.earningLot.findMany({
    where: { userId, status: "AVAILABLE", amount: { gt: 0 } },
    orderBy: { availableAt: "asc" },
    include: { allocations: { where: { status: { in: ["RESERVED", "PAID"] } }, select: { amount: true, amountKes: true, currency: true } } },
  })
  const fines = await db.creatorFine.findMany({
    where: { creatorId: userId, status: "OUTSTANDING" },
    orderBy: { createdAt: "asc" },
  })
  let maturedAvailableKes = new Prisma.Decimal(0)
  for (const lot of lots) {
    const lotKes = lot.currency === "USD" ? new Prisma.Decimal(lot.amount).mul(rate) : new Prisma.Decimal(lot.amount)
    const allocatedKes = lot.allocations.reduce((sum, allocation) => {
      return sum.plus(allocation.amountKes)
    }, new Prisma.Decimal(0))
    maturedAvailableKes = maturedAvailableKes.plus(Prisma.Decimal.max(0, lotKes.minus(allocatedKes)))
  }
  const outstandingFinesKes = fines.reduce((sum, fine) => sum.plus(fine.amount), new Prisma.Decimal(0))
  const withdrawableKes = Prisma.Decimal.max(0, maturedAvailableKes.minus(outstandingFinesKes))
  const withdrawableUsd = money(withdrawableKes.div(rate))
  return {
    grossUsd,
    feeUsd,
    netUsd,
    grossKes,
    netKes,
    rate,
    feePercent,
    maturedAvailableKes: money(maturedAvailableKes),
    outstandingFinesKes: money(outstandingFinesKes),
    withdrawableKes: money(withdrawableKes),
    withdrawableUsd,
    minimumShortfallUsd: values.minimumShortfallUsd,
    fineIds: fines.map((fine) => fine.id),
    expiresAt: new Date(Date.now() + 5 * 60_000),
    lots,
  }
}

export async function createWithdrawalRequest(input: CreateWithdrawalInput) {
  await verifyWithdrawalQuote(input)
  const withdrawal = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.userId} FOR UPDATE`
    const quote = await getWithdrawalQuote(input.userId, input.amount, tx)
    if (quote.netUsd.lt(40)) throw new Error("Net withdrawal must be at least USD 40 after fees")
    if (input.expectedRate != null && !quote.rate.eq(input.expectedRate)) throw new Error("The exchange rate changed. Review the updated quote.")
    if (input.expectedFeePercent != null && !quote.feePercent.eq(input.expectedFeePercent)) throw new Error("The withdrawal fee changed. Review the updated quote.")
    if (quote.grossUsd.gt(quote.withdrawableUsd)) throw new Error("Insufficient matured earnings for this withdrawal")
    let remainingKes = money(quote.grossKes.plus(quote.outstandingFinesKes))
    const payout = await tx.creatorPayout.create({
      data: {
        userId: input.userId,
        amount: quote.netKes,
        grossAmountUsd: quote.grossUsd,
        feeAmountUsd: quote.feeUsd,
        netAmountUsd: quote.netUsd,
        exchangeRate: quote.rate,
        destination: input.destination,
        provider: input.method.toUpperCase(),
        status: "PROCESSING",
      },
    })
    for (const lot of quote.lots) {
      if (remainingKes.lte(0)) break
      const lotKes = lot.currency === "USD" ? new Prisma.Decimal(lot.amount).mul(quote.rate) : new Prisma.Decimal(lot.amount)
      const usedKes = lot.allocations.reduce((sum, allocation) => sum.plus(allocation.amountKes), new Prisma.Decimal(0))
      const usedSource = lot.allocations.reduce((sum, allocation) => sum.plus(allocation.amount), new Prisma.Decimal(0))
      const availableKes = Prisma.Decimal.max(0, lotKes.minus(usedKes))
      const availableSource = Prisma.Decimal.max(0, new Prisma.Decimal(lot.amount).minus(usedSource))
      if (availableKes.lte(0)) continue
      const allocatedKes = Prisma.Decimal.min(availableKes, remainingKes)
      const consumesLot = allocatedKes.eq(availableKes)
      const allocationAmount = consumesLot
        ? availableSource
        : lot.currency === "USD"
          ? allocatedKes.div(quote.rate).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)
          : money(allocatedKes)
      await tx.payoutAllocation.create({ data: {
        payoutId: payout.id,
        earningLotId: lot.id,
        amount: allocationAmount,
        amountKes: money(allocatedKes),
        currency: lot.currency,
      } })
      remainingKes = money(remainingKes.minus(allocatedKes))
      if (consumesLot) {
        await tx.earningLot.update({ where: { id: lot.id }, data: { status: "RESERVED", payoutId: payout.id } })
      }
    }
    if (remainingKes.gt("0.01")) throw new Error("Insufficient matured earnings for this withdrawal")
    return tx.withdrawalRequest.create({
      data: {
        userId: input.userId,
        amount: quote.grossUsd,
        grossAmountUsd: quote.grossUsd,
        feeAmountUsd: quote.feeUsd,
        netAmountUsd: quote.netUsd,
        exchangeRate: quote.rate,
        netAmountKes: quote.netKes,
        quoteExpiresAt: quote.expiresAt,
        method: input.method,
        destination: input.destination,
        status: "pending",
        metadata: toJsonValue({
          ...input.metadata,
          fineIds: quote.fineIds,
          outstandingFinesKes: Number(quote.outstandingFinesKes),
        }),
        creatorPayoutId: payout.id,
      },
    })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000, maxWait: 10000 })

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
