import { CreditKind, Prisma, TipTier } from "@prisma/client"
import { prisma } from "@/lib/prisma"

// ── Pricing & value tables (single source of truth) ────────────────
// What the user PAYS at checkout (KES).
export const PURCHASE_PRICE_KES: Record<CreditKind, number> = {
  KEY: 120,
  CHAT_CREDIT: 20,
  VOICE_SESSION: 450,
  VIDEO_SESSION: 600,
}

// What each credit is WORTH once on the account / transferred to a creator (KES).
export const ON_ACCOUNT_VALUE_KES: Record<CreditKind, number> = {
  KEY: 80,
  CHAT_CREDIT: 10,
  VOICE_SESSION: 225,
  VIDEO_SESSION: 300,
}

// Minimum cart: at least 1 Key + 5 ChatCredits; both buyable in increments of 1.
export const MIN_PURCHASE: Partial<Record<CreditKind, number>> = {
  KEY: 1,
  CHAT_CREDIT: 5,
}

// Tips (USD) — sent straight to the creator, never converted to credits.
export const TIP_USD: Record<TipTier, number> = {
  PEBBLE: 1,
  GEM: 5,
  DIAMOND: 10,
}
export const TIP_CREATOR_SHARE = 0.5
export const TIP_REVIEW_THRESHOLD = 5 // a user's 6th+ tip is flagged for manual review

const BALANCE_FIELD: Record<
  CreditKind,
  "keys" | "chatCredits" | "voiceSessions" | "videoSessions"
> = {
  KEY: "keys",
  CHAT_CREDIT: "chatCredits",
  VOICE_SESSION: "voiceSessions",
  VIDEO_SESSION: "videoSessions",
}

export type CreditBalances = {
  keys: number
  chatCredits: number
  voiceSessions: number
  videoSessions: number
}

/** Thrown when a user tries to spend a credit they don't have. */
export class InsufficientCreditsError extends Error {
  constructor(public kind: CreditKind) {
    super("You have insufficient Balance")
    this.name = "InsufficientCreditsError"
  }
}

export async function getOrCreateCreditAccount(userId: string) {
  return prisma.creditAccount.upsert({
    where: { userId },
    create: { userId },
    update: {},
  })
}

export async function getCreditBalances(userId: string): Promise<CreditBalances> {
  const acct = await prisma.creditAccount.findUnique({ where: { userId } })
  return {
    keys: acct?.keys ?? 0,
    chatCredits: acct?.chatCredits ?? 0,
    voiceSessions: acct?.voiceSessions ?? 0,
    videoSessions: acct?.videoSessions ?? 0,
  }
}

/**
 * Allocate purchased credits to a user's account after a successful payment.
 * Idempotent per (transactionId, kind) so a replayed payment callback can't
 * double-credit. `items` maps a CreditKind to the quantity bought.
 */
export async function allocateCredits(params: {
  userId: string
  items: Partial<Record<CreditKind, number>>
  transactionId: string
}): Promise<CreditBalances> {
  const { userId, items, transactionId } = params
  await getOrCreateCreditAccount(userId)

  await prisma.$transaction(
    async (tx) => {
      for (const [k, qty] of Object.entries(items)) {
        const kind = k as CreditKind
        if (!qty || qty <= 0) continue
        const idempotencyKey = `purchase:${transactionId}:${kind}`
        const exists = await tx.creditLedger.findUnique({ where: { idempotencyKey } })
        if (exists) continue

        const field = BALANCE_FIELD[kind]
        await tx.creditAccount.update({
          where: { userId },
          data: { [field]: { increment: qty } },
        })
        await tx.creditLedger.create({
          data: {
            userId,
            kind,
            entryType: "PURCHASE",
            quantity: qty,
            value: new Prisma.Decimal(ON_ACCOUNT_VALUE_KES[kind] * qty),
            idempotencyKey,
            metadata: { transactionId },
          },
        })
      }
    },
    { timeout: 20000, maxWait: 10000 },
  )

  return getCreditBalances(userId)
}

/**
 * Spend one credit of `kind` from the payer and transfer the same on-account
 * value to the creator. Atomic + idempotent (per `idempotencyKey`, typically a
 * message/session id). Throws InsufficientCreditsError if the payer has none.
 */
export async function consumeCredit(params: {
  userId: string // payer
  creatorId: string // recipient credited the value
  kind: CreditKind
  idempotencyKey: string
  metadata?: Prisma.InputJsonValue
}): Promise<CreditBalances> {
  const { userId, creatorId, kind, idempotencyKey, metadata } = params
  const field = BALANCE_FIELD[kind]
  const value = new Prisma.Decimal(ON_ACCOUNT_VALUE_KES[kind])

  await prisma.$transaction(
    async (tx) => {
      // Already charged for this action? No-op.
      const already = await tx.creditLedger.findUnique({
        where: { idempotencyKey: `consume:${idempotencyKey}` },
      })
      if (already) return

      const acct = await tx.creditAccount.findUnique({ where: { userId } })
      if (!acct || acct[field] <= 0) throw new InsufficientCreditsError(kind)

      await tx.creditAccount.update({
        where: { userId },
        data: { [field]: { decrement: 1 } },
      })
      await tx.creditLedger.create({
        data: {
          userId,
          kind,
          entryType: "CONSUME",
          quantity: -1,
          value,
          counterpartyId: creatorId,
          idempotencyKey: `consume:${idempotencyKey}`,
          metadata,
        },
      })
      // Creator earns the value (not a spendable unit).
      await tx.creditLedger.create({
        data: {
          userId: creatorId,
          kind,
          entryType: "CREATOR_EARN",
          quantity: 0,
          value,
          counterpartyId: userId,
          idempotencyKey: `earn:${idempotencyKey}`,
          metadata,
        },
      })
    },
    { timeout: 20000, maxWait: 10000 },
  )

  return getCreditBalances(userId)
}

/**
 * Record a tip sent straight to a creator (50% of the sent USD value). Flags
 * for manual review once the sender exceeds TIP_REVIEW_THRESHOLD tips.
 */
export async function recordTip(params: {
  senderId: string
  receiverId: string
  tier: TipTier
  transactionId: string
}) {
  const { senderId, receiverId, tier, transactionId } = params
  const amountUsd = TIP_USD[tier]
  const creatorAmountUsd = amountUsd * TIP_CREATOR_SHARE

  const priorTips = await prisma.tip.count({ where: { senderId } })
  const flaggedForReview = priorTips >= TIP_REVIEW_THRESHOLD

  const tip = await prisma.tip.create({
    data: {
      senderId,
      receiverId,
      tier,
      amountUsd: new Prisma.Decimal(amountUsd),
      creatorAmountUsd: new Prisma.Decimal(creatorAmountUsd),
      flaggedForReview,
      transactionId,
    },
  })

  // Creator earns the USD value (tracked in USD, separate from KES credits).
  await prisma.creditLedger.create({
    data: {
      userId: receiverId,
      entryType: "CREATOR_EARN",
      quantity: 0,
      value: new Prisma.Decimal(creatorAmountUsd),
      currency: "USD",
      counterpartyId: senderId,
      idempotencyKey: `tip:${transactionId}`,
      metadata: { tier, tipId: tip.id },
    },
  })

  return tip
}

export type CartItems = Partial<Record<CreditKind, number>>

/** Validate a purchase cart against minimums/increments; return the KES total. */
export function priceCart(items: CartItems): { totalKes: number; normalized: CartItems } {
  const normalized: CartItems = {}
  let total = 0

  for (const [k, qty] of Object.entries(items)) {
    const kind = k as CreditKind
    const n = Math.floor(Number(qty) || 0)
    if (n <= 0) continue
    normalized[kind] = n
    total += PURCHASE_PRICE_KES[kind] * n
  }

  // Minimum cart: at least 1 Key + 5 ChatCredits must be present together.
  const keys = normalized.KEY ?? 0
  const chat = normalized.CHAT_CREDIT ?? 0
  if (keys > 0 || chat > 0) {
    if (keys < (MIN_PURCHASE.KEY ?? 0) || chat < (MIN_PURCHASE.CHAT_CREDIT ?? 0)) {
      throw new Error(
        `Minimum purchase is ${MIN_PURCHASE.KEY} Key and ${MIN_PURCHASE.CHAT_CREDIT} ChatCredits`,
      )
    }
  }

  if (total <= 0) throw new Error("Cart is empty")
  return { totalKes: total, normalized }
}

/**
 * Called after an MPESA STK callback. If the matching CreditPurchase succeeded
 * and isn't yet allocated, allocate the credits (idempotent on the purchase
 * id). No-ops for non-credit MPESA callbacks.
 */
export async function finalizeCreditPurchaseByCheckoutId(
  checkoutRequestId: string,
  success: boolean,
) {
  if (!checkoutRequestId) return
  const purchase = await prisma.creditPurchase.findUnique({
    where: { checkoutRequestId },
  })
  if (!purchase) return

  if (!success) {
    await prisma.creditPurchase.update({
      where: { id: purchase.id },
      data: { status: "FAILED" },
    })
    return
  }

  if (purchase.allocated) return

  await allocateCredits({
    userId: purchase.userId,
    items: purchase.items as CartItems,
    transactionId: purchase.id,
  })

  await prisma.creditPurchase.update({
    where: { id: purchase.id },
    data: { status: "SUCCESS", allocated: true },
  })
}

/** Sum a creator's earned value (for verification + Phase 3 payouts). */
export async function getCreatorEarnings(userId: string) {
  const rows = await prisma.creditLedger.groupBy({
    by: ["currency"],
    where: { userId, entryType: "CREATOR_EARN" },
    _sum: { value: true },
  })
  const byCurrency: Record<string, number> = {}
  for (const r of rows) byCurrency[r.currency] = Number(r._sum.value ?? 0)
  return byCurrency
}
