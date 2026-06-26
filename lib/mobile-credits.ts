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
  await prisma.$transaction(
    (tx) => allocateCreditsInTransaction(tx, { userId, items, transactionId }),
    { timeout: 20000, maxWait: 10000 },
  )

  return getCreditBalances(userId)
}

export async function allocateCreditsInTransaction(
  tx: Prisma.TransactionClient,
  params: {
    userId: string
    items: Partial<Record<CreditKind, number>>
    transactionId: string
  },
) {
  const { userId, items, transactionId } = params
  await tx.creditAccount.upsert({ where: { userId }, create: { userId }, update: {} })
  for (const [k, qty] of Object.entries(items)) {
    const kind = k as CreditKind
    if (!qty || qty <= 0) continue
    const idempotencyKey = `purchase:${transactionId}:${kind}`
    const exists = await tx.creditLedger.findUnique({ where: { idempotencyKey } })
    if (exists) continue
    const field = BALANCE_FIELD[kind]
    await tx.creditAccount.update({ where: { userId }, data: { [field]: { increment: qty } } })
    await tx.creditLedger.create({ data: {
      userId, kind, entryType: "PURCHASE", quantity: qty,
      value: new Prisma.Decimal(ON_ACCOUNT_VALUE_KES[kind] * qty),
      idempotencyKey, metadata: { transactionId },
    } })
  }
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
  await prisma.$transaction(
    (tx) => consumeCreditInTransaction(tx, params),
    { timeout: 20000, maxWait: 10000 },
  )

  return getCreditBalances(params.userId)
}

/** Same transfer as consumeCredit, but joins an existing transaction. */
export async function consumeCreditInTransaction(
  tx: Prisma.TransactionClient,
  params: {
    userId: string
    creatorId: string
    kind: CreditKind
    idempotencyKey: string
    metadata?: Prisma.InputJsonValue
  },
) {
  const { userId, creatorId, kind, idempotencyKey, metadata } = params
  const field = BALANCE_FIELD[kind]
  const value = new Prisma.Decimal(ON_ACCOUNT_VALUE_KES[kind])

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
  await tx.earningLot.upsert({
    where: { source_sourceId_userId: { source: kind, sourceId: idempotencyKey, userId: creatorId } },
    create: {
      userId: creatorId,
      source: kind,
      sourceId: idempotencyKey,
      amount: value,
      availableAt: new Date(Date.now() + 30 * 86_400_000),
    },
    update: {},
  })
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
  exchangeRate?: number
}) {
  return prisma.$transaction((tx) => recordTipInTransaction(tx, params))
}

export async function recordTipInTransaction(
  tx: Prisma.TransactionClient,
  params: {
    senderId: string
    receiverId: string
    tier: TipTier
    transactionId: string
    exchangeRate?: number
  },
) {
  const { senderId, receiverId, tier, transactionId, exchangeRate } = params
  const existing = await tx.tip.findUnique({ where: { transactionId } })
  if (existing) return existing
  const amountUsd = TIP_USD[tier]
  const creatorAmountUsd = amountUsd * TIP_CREATOR_SHARE

  const priorTips = await tx.tip.count({ where: {
    senderId,
    receiverId,
    createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  } })
  const flaggedForReview = priorTips >= TIP_REVIEW_THRESHOLD

  const tip = await tx.tip.create({ data: {
      senderId, receiverId, tier,
      amountUsd: new Prisma.Decimal(amountUsd), creatorAmountUsd: new Prisma.Decimal(creatorAmountUsd),
      flaggedForReview, reviewStatus: flaggedForReview ? "HELD" : "CLEAR", transactionId,
      exchangeRate: exchangeRate ? new Prisma.Decimal(exchangeRate) : null,
    } })
    await tx.creditLedger.create({ data: {
      userId: receiverId, entryType: "CREATOR_EARN", quantity: 0,
      value: new Prisma.Decimal(creatorAmountUsd), currency: "USD", counterpartyId: senderId,
      idempotencyKey: `tip:${transactionId}`, metadata: { tier, tipId: tip.id },
    } })
    await tx.earningLot.create({ data: {
      userId: receiverId, source: "TIP", sourceId: tip.id,
      amount: new Prisma.Decimal(creatorAmountUsd), currency: "USD",
      status: flaggedForReview ? "HELD" : "PENDING",
      heldReason: flaggedForReview ? "Sixth or later tip from this sender in 24 hours" : null,
      availableAt: new Date(Date.now() + 30 * 86_400_000),
    } })
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
