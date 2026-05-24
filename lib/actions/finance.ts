"use server"

import { TipRequestStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSessionUser } from "@/lib/auth"
import { getWalletAccounts, getWithdrawalsAdmin, getTipRequestsAdmin } from "@/lib/finance-queries"
import { createWalletTransaction, serializeWalletTransaction, serializeWithdrawal } from "@/lib/mobile-wallet"
import { errorResult, getActionFormData, successResult, type ActionResult } from "@/lib/actions/action-result"
import { createUserNotification } from "@/lib/mobile-notifications"
import { serializeTipRequest } from "@/lib/mobile-tip-requests"
import { emitChatRealtimeToUser } from "@/lib/realtime"

const walletQuerySchema = z.object({
  query: z.string().optional(),
  page: z.number().optional(),
})

const walletAdjustmentSchema = z.object({
  userId: z.string().min(1),
  amount: z.coerce.number().positive(),
  direction: z.enum(["credit", "debit"]),
  reason: z.string().min(3),
})

const withdrawalStatusSchema = z.object({
  withdrawalId: z.string().min(1),
  status: z.enum(["approved", "paid", "rejected", "cancelled"]),
})

const tipRequestStatusSchema = z.object({
  tipRequestId: z.string().min(1),
  status: z.enum(["pending", "sent", "completed", "cancelled"]),
})

function buildAdminTransactionId(prefix: string, entityId: string) {
  return `${prefix}-${entityId}`
}

export async function queryWalletAccountsAction(params: {
  query?: string
  page?: number
}) {
  await requireSessionUser()
  const parsed = walletQuerySchema.parse(params)
  return getWalletAccounts(parsed)
}

export async function queryWithdrawalsAdminAction(params: {
  query?: string
  status?: string
}) {
  await requireSessionUser()
  return getWithdrawalsAdmin(params)
}

export async function queryTipRequestsAdminAction(params: {
  query?: string
  status?: string
}) {
  await requireSessionUser()
  return getTipRequestsAdmin(params)
}

export async function createWalletAdjustmentAction(
  stateOrFormData: ActionResult | FormData,
  maybeFormData?: FormData,
) {
  try {
    const formData = getActionFormData(stateOrFormData, maybeFormData)
    const session = await requireSessionUser()
    const parsed = walletAdjustmentSchema.parse({
      userId: formData.get("userId"),
      amount: formData.get("amount"),
      direction: formData.get("direction"),
      reason: formData.get("reason"),
    })

    const user = await prisma.user.findUnique({
      where: { id: parsed.userId },
      select: { id: true, fullName: true },
    })

    if (!user) {
      throw new Error("Wallet owner not found.")
    }

    if (parsed.direction === "debit") {
      const entries = await prisma.walletTransaction.findMany({
        where: { userId: user.id },
        select: { amount: true, type: true },
      })

      const balance = entries.reduce((sum, entry) => {
        const amount = Number(entry.amount)
        return entry.type.toLowerCase() === "debit" ? sum - amount : sum + amount
      }, 0)

      if (parsed.amount > balance) {
        throw new Error("Debit amount exceeds the current wallet balance.")
      }
    }

    await createWalletTransaction({
      userId: user.id,
      amount: parsed.amount,
      type: parsed.direction,
      senderId: parsed.direction === "credit" ? session.id : user.id,
      receiverId: parsed.direction === "credit" ? user.id : session.id,
      senderName: parsed.direction === "credit" ? `Admin ${session.name}` : user.fullName,
      receiverName: parsed.direction === "credit" ? user.fullName : `Admin ${session.name}`,
      transactionId: buildAdminTransactionId("ADJ", crypto.randomUUID()),
      metadata: {
        source: "admin-adjustment",
        reason: parsed.reason,
        adminId: session.id,
        adminName: session.name,
      },
    })

    await createUserNotification({
      userId: user.id,
      title: "Wallet update",
      message:
        parsed.direction === "credit"
          ? `Your wallet has been credited by ${parsed.amount.toFixed(2)}.`
          : `A wallet debit of ${parsed.amount.toFixed(2)} has been recorded.`,
      type: "wallet_update",
      metadata: {
        direction: parsed.direction,
        amount: parsed.amount,
        reason: parsed.reason,
      },
    })

    revalidatePath("/wallets")
    revalidatePath(`/wallets/${user.id}`)
    revalidatePath("/dashboard")
    return successResult("Wallet adjustment recorded successfully.")
  } catch (error) {
    return errorResult(error, "Unable to record wallet adjustment.")
  }
}

export async function updateWithdrawalStatusAdminAction(withdrawalId: string, nextStatus: string) {
  await requireSessionUser()
  const parsed = withdrawalStatusSchema.parse({
    withdrawalId,
    status: nextStatus,
  })

  const withdrawal = await prisma.withdrawalRequest.findUnique({
    where: { id: parsed.withdrawalId },
    include: {
      user: {
        select: { id: true, fullName: true },
      },
    },
  })

  if (!withdrawal) {
    throw new Error("Withdrawal request not found.")
  }

  const currentStatus = withdrawal.status
  if (currentStatus === parsed.status) {
    return { success: true, message: "Withdrawal status already up to date." }
  }

  const isTerminal = currentStatus === "rejected" || currentStatus === "cancelled" || currentStatus === "paid"
  if (isTerminal) {
    throw new Error("This withdrawal is already finalized.")
  }

  if (currentStatus === "pending" && !["approved", "rejected", "cancelled"].includes(parsed.status)) {
    throw new Error("Pending withdrawals can only be approved, rejected, or cancelled.")
  }

  if (currentStatus === "approved" && !["paid", "rejected", "cancelled"].includes(parsed.status)) {
    throw new Error("Approved withdrawals can only be marked paid, rejected, or cancelled.")
  }

  let reversalTransactionId: string | null = null

  await prisma.$transaction(async (tx) => {
    await tx.withdrawalRequest.update({
      where: { id: withdrawal.id },
      data: { status: parsed.status },
    })

    if (parsed.status === "rejected" || parsed.status === "cancelled") {
      reversalTransactionId = buildAdminTransactionId("WREV", withdrawal.id)
      const existingReversal = await tx.walletTransaction.findUnique({
        where: { transactionId: reversalTransactionId },
      })

      if (!existingReversal) {
        await tx.walletTransaction.create({
          data: {
            userId: withdrawal.userId,
            amount: withdrawal.amount,
            type: "credit",
            senderId: "system",
            receiverId: withdrawal.userId,
            senderName: "Withdrawal reversal",
            receiverName: withdrawal.user.fullName,
            transactionId: reversalTransactionId,
            metadata: {
              source: "withdrawal-reversal",
              withdrawalId: withdrawal.id,
              previousStatus: currentStatus,
              newStatus: parsed.status,
            },
          },
        })
      }
    }
  })

  const updatedWithdrawal = await prisma.withdrawalRequest.findUnique({
    where: { id: withdrawal.id },
  })

  if (updatedWithdrawal) {
    emitChatRealtimeToUser(withdrawal.userId, {
      channel: "wallet",
      type: "withdrawal_updated",
      withdrawalId: updatedWithdrawal.id,
      data: serializeWithdrawal(updatedWithdrawal),
    })
  }

  if (reversalTransactionId) {
    const reversal = await prisma.walletTransaction.findUnique({
      where: { transactionId: reversalTransactionId },
    })

    if (reversal) {
      emitChatRealtimeToUser(withdrawal.userId, {
        channel: "wallet",
        type: "wallet_transaction_created",
        data: serializeWalletTransaction(reversal),
      })
    }
  }

  emitChatRealtimeToUser(withdrawal.userId, {
    channel: "wallet",
    type: "wallet_refresh",
    refreshedAt: new Date().toISOString(),
  })

  await createUserNotification({
    userId: withdrawal.userId,
    title: "Withdrawal update",
    message: `Your withdrawal request is now ${parsed.status}.`,
    type: "withdrawal_update",
    metadata: {
      withdrawalId: withdrawal.id,
      amount: Number(withdrawal.amount),
      status: parsed.status,
    },
  })

  revalidatePath("/withdrawals")
  revalidatePath("/wallets")
  revalidatePath(`/wallets/${withdrawal.userId}`)
  return { success: true, message: "Withdrawal status updated successfully." }
}

export async function updateTipRequestStatusAdminAction(tipRequestId: string, nextStatus: string) {
  await requireSessionUser()
  const parsed = tipRequestStatusSchema.parse({
    tipRequestId,
    status: nextStatus,
  })

  const tipRequest = await prisma.tipRequest.findUnique({
    where: { id: parsed.tipRequestId },
    include: {
      sender: { select: { fullName: true } },
      receiver: { select: { fullName: true } },
    },
  })

  if (!tipRequest) {
    throw new Error("Tip request not found.")
  }

  const status = parsed.status.toUpperCase() as TipRequestStatus

  const updatedTipRequest = await prisma.$transaction(async (tx) => {
    await tx.tipRequest.update({
      where: { id: tipRequest.id },
      data: { status },
    })

    return tx.tipRequest.findUnique({
      where: { id: tipRequest.id },
    })
  })

  if (updatedTipRequest) {
    const serialized = serializeTipRequest(updatedTipRequest)
    emitChatRealtimeToUser(tipRequest.senderId, {
      channel: "tip_requests",
      type: "tip_request_updated",
      otherUserId: tipRequest.receiverId,
      data: serialized,
    })
    emitChatRealtimeToUser(tipRequest.receiverId, {
      channel: "tip_requests",
      type: "tip_request_updated",
      otherUserId: tipRequest.senderId,
      data: serialized,
    })
  }

  await createUserNotification({
    userId: tipRequest.senderId,
    title: "Tip request update",
    message: `${tipRequest.receiver.fullName.split(" ").at(0) || "A user"} tip request is now ${parsed.status}.`,
    type: "tip_request_update",
    metadata: {
      tipRequestId: tipRequest.id,
      status: parsed.status,
      amount: Number(tipRequest.amount),
    },
  })

  revalidatePath("/tip-requests")
  return { success: true, message: "Tip request status updated successfully." }
}
