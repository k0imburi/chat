import "server-only"
import { ChatMessageType, TipTier, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { initiateStkPush, normalizePhone } from "@/lib/mpesa"
import { TIP_USD, TIP_CREATOR_SHARE, TIP_REVIEW_THRESHOLD } from "@/lib/mobile-credits"
import { newPaymentIdempotencyKey } from "@/lib/payment-attempts"
import { emitChatRealtimeToUser } from "@/lib/realtime"
import { createUserNotification } from "@/lib/mobile-notifications"

export type TipWallet = { pebbles: number; gems: number; diamonds: number }

const TIP_FIELD: Record<TipTier, keyof TipWallet> = {
  PEBBLE: "pebbles",
  GEM: "gems",
  DIAMOND: "diamonds",
}

export async function getTipWallet(userId: string): Promise<TipWallet> {
  const acct = await prisma.creditAccount.findUnique({ where: { userId } })
  return {
    pebbles: acct?.pebbles ?? 0,
    gems: acct?.gems ?? 0,
    diamonds: acct?.diamonds ?? 0,
  }
}

export async function initiateTipTopup(input: {
  userId: string
  tier: TipTier
  qty: number
  phone: string
}) {
  if (input.qty < 1 || input.qty > 20) throw new Error("Quantity must be between 1 and 20")
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } })
  const rate = Number(settings?.usdToKesRate || 0)
  if (rate <= 0) throw new Error("Exchange rate not configured")
  const amountUsd = TIP_USD[input.tier] * input.qty
  const totalKes = Math.ceil(amountUsd * rate)
  const phone = normalizePhone(input.phone)

  const purchase = await prisma.$transaction(async (tx) => {
    const attempt = await tx.paymentAttempt.create({
      data: {
        userId: input.userId,
        provider: "MPESA",
        purpose: "TIP",
        amount: new Prisma.Decimal(totalKes),
        currency: "KES",
        expectedPhone: phone,
        idempotencyKey: newPaymentIdempotencyKey("TIP", input.userId),
        metadata: { tier: input.tier, qty: input.qty, amountUsd, exchangeRate: rate },
      },
    })
    return tx.tipPurchase.create({
      data: {
        senderId: input.userId,
        receiverId: null,
        tier: input.tier,
        qty: input.qty,
        amountUsd: new Prisma.Decimal(amountUsd),
        totalKes: new Prisma.Decimal(totalKes),
        exchangeRate: new Prisma.Decimal(rate),
        phone,
        status: "PENDING",
        provider: "MPESA",
        paymentAttemptId: attempt.id,
      },
    })
  })

  let stk: Awaited<ReturnType<typeof initiateStkPush>>
  try {
    stk = await initiateStkPush({
      phone,
      amount: totalKes,
      reference: purchase.id,
      description: `${input.qty}x ${input.tier} tip token`,
      userId: input.userId,
      paymentAttemptId: purchase.paymentAttemptId!,
    })
  } catch (error) {
    await prisma.$transaction([
      prisma.tipPurchase.update({ where: { id: purchase.id }, data: { status: "FAILED" } }),
      prisma.paymentAttempt.update({
        where: { id: purchase.paymentAttemptId! },
        data: { status: "FAILED", failureReason: error instanceof Error ? error.message.slice(0, 1000) : "STK failed" },
      }),
    ])
    throw error
  }

  await prisma.tipPurchase.update({
    where: { id: purchase.id },
    data: { checkoutRequestId: stk.checkoutRequestID || null, status: stk.success ? "PENDING" : "FAILED" },
  })

  return {
    success: stk.success,
    message: stk.message,
    purchaseId: purchase.id,
    checkoutRequestId: stk.checkoutRequestID,
    totalKes,
    qty: input.qty,
    tier: input.tier,
  }
}

export async function creditTipTokensInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  tier: TipTier,
  qty: number,
) {
  const field = TIP_FIELD[tier]
  await tx.creditAccount.upsert({
    where: { userId },
    create: { userId, [field]: qty },
    update: { [field]: { increment: qty } },
  })
}

export class InsufficientTipBalanceError extends Error {
  constructor(public tier: TipTier) {
    super(`You don't have any ${tier} tokens`)
    this.name = "InsufficientTipBalanceError"
  }
}

export async function sendTipFromWallet(input: { senderId: string; receiverId: string; tier: TipTier }) {
  if (input.senderId === input.receiverId) throw new Error("You cannot tip yourself")

  const receiver = await prisma.user.findUnique({
    where: { id: input.receiverId },
    select: { id: true, fullName: true, earningSuspendedUntil: true },
  })
  if (!receiver) throw new Error("Creator not found")
  if (receiver.earningSuspendedUntil && receiver.earningSuspendedUntil > new Date()) {
    throw new Error("Tips are temporarily unavailable for this creator")
  }

  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } })
  const rate = Number(settings?.usdToKesRate || 130)
  const amountUsd = TIP_USD[input.tier]
  const creatorAmountUsd = amountUsd * TIP_CREATOR_SHARE
  const field = TIP_FIELD[input.tier]

  const result = await prisma.$transaction(async (tx) => {
    const acct = await tx.creditAccount.findUnique({ where: { userId: input.senderId } })
    if (!acct || (acct[field] as number) <= 0) throw new InsufficientTipBalanceError(input.tier)

    await tx.creditAccount.update({
      where: { userId: input.senderId },
      data: { [field]: { decrement: 1 } },
    })

    const priorCount = await tx.tip.count({ where: { senderId: input.senderId } })
    const flaggedForReview = priorCount >= TIP_REVIEW_THRESHOLD

    const tip = await tx.tip.create({
      data: {
        senderId: input.senderId,
        receiverId: input.receiverId,
        tier: input.tier,
        amountUsd: new Prisma.Decimal(amountUsd),
        creatorAmountUsd: new Prisma.Decimal(creatorAmountUsd),
        exchangeRate: new Prisma.Decimal(rate),
        flaggedForReview,
        reviewStatus: flaggedForReview ? "HELD" : "CLEAR",
      },
    })

    await tx.creditLedger.create({
      data: {
        userId: input.receiverId,
        entryType: "CREATOR_EARN",
        quantity: 0,
        value: new Prisma.Decimal(creatorAmountUsd),
        currency: "USD",
        counterpartyId: input.senderId,
        idempotencyKey: `tip:${tip.id}`,
        metadata: { tier: input.tier, tipId: tip.id },
      },
    })

    await tx.earningLot.create({
      data: {
        userId: input.receiverId,
        source: "TIP",
        sourceId: tip.id,
        amount: new Prisma.Decimal(creatorAmountUsd),
        currency: "USD",
        status: flaggedForReview ? "HELD" : "PENDING",
        heldReason: flaggedForReview
          ? "Tip held for review"
          : null,
        availableAt: new Date(Date.now() + 30 * 86_400_000),
      },
    })

    // Create TIP chat message in the existing thread (if one exists)
    const participant = await tx.chatParticipant.findFirst({
      where: { userId: input.senderId, otherUserId: input.receiverId },
      select: { threadId: true },
    })
    let tipMessage: { id: string; threadId: string; sentAt: Date } | null = null
    if (participant) {
      const msg = await tx.chatMessage.create({
        data: {
          threadId: participant.threadId,
          senderId: input.senderId,
          type: ChatMessageType.TIP,
          text: input.tier,
          reactions: {},
          locked: false,
        },
        select: { id: true, threadId: true, sentAt: true },
      })
      tipMessage = msg
      await tx.chatThread.update({
        where: { id: participant.threadId },
        data: { lastMessageAt: msg.sentAt, lastMessageType: ChatMessageType.TIP },
      })
      await tx.chatParticipant.updateMany({
        where: { threadId: participant.threadId, userId: input.receiverId },
        data: { unreadCount: { increment: 1 } },
      })
    }

    const updated = await tx.creditAccount.findUnique({ where: { userId: input.senderId } })
    return {
      tip,
      tipMessage,
      wallet: {
        pebbles: updated?.pebbles ?? 0,
        gems: updated?.gems ?? 0,
        diamonds: updated?.diamonds ?? 0,
      },
    }
  }, { timeout: 20_000, maxWait: 10_000 })

  // Push TIP message to both parties in real time
  if (result.tipMessage) {
    const serializedTip = {
      id: result.tipMessage.id,
      chatId: result.tipMessage.threadId,
      senderId: input.senderId,
      type: "tip",
      textMsg: input.tier,
      imageUrl: "",
      replyToId: "",
      replyToText: "",
      replyToSenderId: "",
      replyToSenderName: "",
      reactions: {},
      isRead: false,
      locked: false,
      lockedContentType: "",
      unlockKind: "",
      sentAt: result.tipMessage.sentAt.toISOString(),
    }
    emitChatRealtimeToUser(input.senderId, { channel: "chat", type: "message_created", otherUserId: input.receiverId, data: serializedTip })
    emitChatRealtimeToUser(input.receiverId, { channel: "chat", type: "message_created", otherUserId: input.senderId, data: serializedTip })
  }

  const tierName = ({ PEBBLE: "Pebble", GEM: "Gem", DIAMOND: "Diamond" })[input.tier] ?? input.tier
  const sender = await prisma.user.findUnique({
    where: { id: input.senderId },
    select: { fullName: true },
  })
  const senderName = sender?.fullName?.split(" ").at(0) || "Someone"
  await createUserNotification({
    userId: input.receiverId,
    senderId: input.senderId,
    title: "New tip",
    message: `${senderName} sent you a ${tierName} tip 🎁`,
    type: "tip",
    metadata: { tipId: result.tip.id, tier: input.tier, senderName },
  })

  return result
}
