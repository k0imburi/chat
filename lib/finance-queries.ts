import "server-only"

import { Prisma, TipRequestStatus, UserRole } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { DEFAULT_PAGE_SIZE } from "@/lib/constants"
import { formatWalletAccountId, getSignedWalletAmount } from "@/lib/wallet-account"

type WalletUser = {
  id: string
  fullName: string
  email: string | null
  phoneNumber: string | null
  country: string | null
  city: string | null
  createdAt: Date
}

type WalletTx = {
  id: string
  userId: string
  amount: Prisma.Decimal
  type: string
  senderId: string | null
  receiverId: string | null
  senderName: string | null
  receiverName: string | null
  transactionId: string
  metadata: Prisma.JsonValue | null
  date: Date
}

type WithdrawalRow = {
  id: string
  userId: string
  amount: Prisma.Decimal
  method: string
  destination: string
  status: string
  metadata: Prisma.JsonValue | null
  createdAt: Date
  updatedAt: Date
}

function money(value: Prisma.Decimal | number | null | undefined) {
  return Number(value ?? 0)
}

function buildWalletMap(users: WalletUser[], transactions: WalletTx[], withdrawals: WithdrawalRow[]) {
  const transactionMap = new Map<string, WalletTx[]>()
  const withdrawalMap = new Map<string, WithdrawalRow[]>()

  for (const tx of transactions) {
    const current = transactionMap.get(tx.userId) ?? []
    current.push(tx)
    transactionMap.set(tx.userId, current)
  }

  for (const withdrawal of withdrawals) {
    const current = withdrawalMap.get(withdrawal.userId) ?? []
    current.push(withdrawal)
    withdrawalMap.set(withdrawal.userId, current)
  }

  return users.map((user) => {
    const userTransactions = (transactionMap.get(user.id) ?? []).sort(
      (a, b) => b.date.getTime() - a.date.getTime(),
    )
    const userWithdrawals = withdrawalMap.get(user.id) ?? []

    const totalCredits = userTransactions
      .filter((tx) => tx.type.toLowerCase() !== "debit")
      .reduce((sum, tx) => sum + money(tx.amount), 0)

    const totalDebits = userTransactions
      .filter((tx) => tx.type.toLowerCase() === "debit")
      .reduce((sum, tx) => sum + money(tx.amount), 0)

    const pendingWithdrawals = userWithdrawals.filter((item) => item.status === "pending")
    const pendingWithdrawalAmount = pendingWithdrawals.reduce((sum, item) => sum + money(item.amount), 0)

    return {
      id: user.id,
      accountId: formatWalletAccountId(user.id),
      user,
      currentBalance: totalCredits - totalDebits,
      totalCredits,
      totalDebits,
      transactionCount: userTransactions.length,
      pendingWithdrawalCount: pendingWithdrawals.length,
      pendingWithdrawalAmount,
      lastTransactionAt: userTransactions[0]?.date ?? null,
      transactions: userTransactions,
      withdrawals: userWithdrawals,
    }
  })
}

export async function getWalletAccounts(params: {
  query?: string
  page?: number
  pageSize?: number
}) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  const skip = (page - 1) * pageSize
  const query = params.query?.trim()

  const where: Prisma.UserWhereInput = {
    role: UserRole.USER,
  }

  if (query) {
    where.OR = [
      { fullName: { contains: query } },
      { email: { contains: query } },
      { phoneNumber: { contains: query } },
      { id: { contains: query } },
    ]
  }

  const [users, total, txAgg, activeWalletGroups, pendingWithdrawalsAgg, pendingAmountAgg] =
    await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          email: true,
          phoneNumber: true,
          country: true,
          city: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.user.count({ where }),
      prisma.walletTransaction.findMany({
        where: {
          user: where,
        },
        select: {
          id: true,
          userId: true,
          amount: true,
          type: true,
          senderId: true,
          receiverId: true,
          senderName: true,
          receiverName: true,
          transactionId: true,
          metadata: true,
          date: true,
        },
      }),
      prisma.walletTransaction.groupBy({
        by: ["userId"],
      }),
      prisma.withdrawalRequest.aggregate({
        where: {
          status: "pending",
          user: where,
        },
        _count: true,
      }),
      prisma.withdrawalRequest.aggregate({
        where: {
          status: "pending",
          user: where,
        },
        _sum: { amount: true },
      }),
    ])

  const userIds = users.map((user) => user.id)
  const withdrawals = userIds.length
    ? await prisma.withdrawalRequest.findMany({
        where: { userId: { in: userIds } },
        select: {
          id: true,
          userId: true,
          amount: true,
          method: true,
          destination: true,
          status: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
        },
      })
    : []

  const walletRows = buildWalletMap(
    users,
    txAgg.filter((tx) => userIds.includes(tx.userId)),
    withdrawals,
  )

  const totalCredits = txAgg
    .filter((tx) => tx.type.toLowerCase() !== "debit")
    .reduce((sum, tx) => sum + money(tx.amount), 0)
  const totalDebits = txAgg
    .filter((tx) => tx.type.toLowerCase() === "debit")
    .reduce((sum, tx) => sum + money(tx.amount), 0)

  return {
    items: walletRows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    summary: {
      totalWallets: total,
      activeWallets: activeWalletGroups.length,
      totalBalance: totalCredits - totalDebits,
      pendingWithdrawalCount: pendingWithdrawalsAgg._count,
      pendingWithdrawalAmount: money(pendingAmountAgg._sum.amount),
      totalTransactions: txAgg.length,
    },
  }
}

export async function getWalletDetail(userId: string) {
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      role: UserRole.USER,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      phoneNumber: true,
      city: true,
      country: true,
      createdAt: true,
      status: true,
    },
  })

  if (!user) return null

  const [transactions, withdrawals] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { date: "asc" },
      select: {
        id: true,
        userId: true,
        amount: true,
        type: true,
        senderId: true,
        receiverId: true,
        senderName: true,
        receiverName: true,
        transactionId: true,
        metadata: true,
        date: true,
      },
    }),
    prisma.withdrawalRequest.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        amount: true,
        method: true,
        destination: true,
        status: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ])

  let runningBalance = 0
  const ledger = transactions.map((tx) => {
    const amount = money(tx.amount)
    const signedAmount = getSignedWalletAmount(tx.type, amount)
    runningBalance += signedAmount

    return {
      id: tx.id,
      transactionId: tx.transactionId,
      type: tx.type,
      amount,
      signedAmount,
      postBalance: runningBalance,
      senderId: tx.senderId,
      receiverId: tx.receiverId,
      senderName: tx.senderName || "Unknown",
      receiverName: tx.receiverName || "Unknown",
      metadata: tx.metadata,
      date: tx.date,
    }
  })

  const totalCredits = ledger
    .filter((tx) => tx.signedAmount > 0)
    .reduce((sum, tx) => sum + tx.amount, 0)
  const totalDebits = ledger
    .filter((tx) => tx.signedAmount < 0)
    .reduce((sum, tx) => sum + tx.amount, 0)
  const pendingWithdrawalAmount = withdrawals
    .filter((item) => item.status === "pending")
    .reduce((sum, item) => sum + money(item.amount), 0)

  return {
    user,
    accountId: formatWalletAccountId(user.id),
    ledger: ledger.slice().reverse(),
    withdrawals: withdrawals.map((item) => ({
      ...item,
      amount: money(item.amount),
    })),
    summary: {
      currentBalance: totalCredits - totalDebits,
      totalCredits,
      totalDebits,
      transactionCount: ledger.length,
      pendingWithdrawalAmount,
      pendingWithdrawalCount: withdrawals.filter((item) => item.status === "pending").length,
    },
  }
}

export async function getWithdrawalsAdmin(params: {
  query?: string
  status?: string
}) {
  const query = params.query?.trim()
  const status = params.status && params.status !== "ALL" ? params.status : undefined

  const where: Prisma.WithdrawalRequestWhereInput = {
    ...(status ? { status } : {}),
    ...(query
      ? {
          OR: [
            { user: { fullName: { contains: query } } },
            { user: { email: { contains: query } } },
            { destination: { contains: query } },
            { method: { contains: query } },
          ],
        }
      : {}),
  }

  const [items, pendingAgg, approvedAgg, paidAgg, rejectedAgg] = await Promise.all([
    prisma.withdrawalRequest.findMany({
      where,
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
    }),
    prisma.withdrawalRequest.aggregate({
      where: { status: "pending" },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.withdrawalRequest.aggregate({
      where: { status: "approved" },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.withdrawalRequest.aggregate({
      where: { status: "paid" },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.withdrawalRequest.aggregate({
      where: { status: { in: ["rejected", "cancelled"] } },
      _count: true,
      _sum: { amount: true },
    }),
  ])

  return {
    items: items.map((item) => ({
      ...item,
      amount: money(item.amount),
    })),
    summary: {
      pendingCount: pendingAgg._count,
      pendingAmount: money(pendingAgg._sum.amount),
      approvedAmount: money(approvedAgg._sum.amount),
      paidAmount: money(paidAgg._sum.amount),
      rejectedAmount: money(rejectedAgg._sum.amount),
    },
  }
}

export async function getTipRequestsAdmin(params: {
  query?: string
  status?: string
}) {
  const query = params.query?.trim()
  const status =
    params.status && params.status !== "ALL"
      ? (params.status.toUpperCase() as TipRequestStatus)
      : undefined

  const where: Prisma.TipRequestWhereInput = {
    ...(status ? { status } : {}),
    ...(query
      ? {
          OR: [
            { sender: { fullName: { contains: query } } },
            { receiver: { fullName: { contains: query } } },
          ],
        }
      : {}),
  }

  const [items, pendingAgg, sentAgg, completedAgg, cancelledAgg] = await Promise.all([
    prisma.tipRequest.findMany({
      where,
      include: {
        sender: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        receiver: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.tipRequest.aggregate({ where: { status: TipRequestStatus.PENDING }, _count: true, _sum: { amount: true } }),
    prisma.tipRequest.aggregate({ where: { status: TipRequestStatus.SENT }, _count: true, _sum: { amount: true } }),
    prisma.tipRequest.aggregate({ where: { status: TipRequestStatus.COMPLETED }, _count: true, _sum: { amount: true } }),
    prisma.tipRequest.aggregate({ where: { status: TipRequestStatus.CANCELLED }, _count: true, _sum: { amount: true } }),
  ])

  return {
    items: items.map((item) => ({
      ...item,
      amount: money(item.amount),
    })),
    summary: {
      pendingCount: pendingAgg._count,
      pendingAmount: money(pendingAgg._sum.amount),
      sentCount: sentAgg._count,
      completedCount: completedAgg._count,
      cancelledCount: cancelledAgg._count,
    },
  }
}
