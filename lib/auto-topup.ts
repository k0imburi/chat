import { AutoTopupConfig, CreditAccount, CreditKind, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/log-error"
import { allocateCredits, ON_ACCOUNT_VALUE_KES, purchasePriceKesFor, type CartItems } from "@/lib/mobile-credits"
import { chargeAuthorization } from "@/lib/paystack"
import { normalizePhone } from "@/lib/mpesa"
import { initiateCreditPurchase } from "@/lib/mobile-credit-purchase"
import { createUserNotification } from "@/lib/mobile-notifications"

// Auto top-up watches spendable utility balances only — Keys, ChatCredits,
// and Voice/Video session credits. Tip tokens (Pebbles/Gems/Diamonds) are a
// deliberate spend-it-when-you-mean-to wallet and were explicitly excluded.
export const AUTO_TOPUP_KINDS = ["KEY", "CHAT_CREDIT", "VOICE_SESSION", "VIDEO_SESSION"] as const
export type AutoTopupKind = (typeof AUTO_TOPUP_KINDS)[number]

const BALANCE_FIELD: Record<AutoTopupKind, keyof CreditAccount> = {
  KEY: "keys",
  CHAT_CREDIT: "chatCredits",
  VOICE_SESSION: "voiceSessions",
  VIDEO_SESSION: "videoSessions",
}
const THRESHOLD_FIELD: Record<AutoTopupKind, keyof AutoTopupConfig> = {
  KEY: "keyThreshold",
  CHAT_CREDIT: "chatThreshold",
  VOICE_SESSION: "voiceThreshold",
  VIDEO_SESSION: "videoThreshold",
}
const REFILL_FIELD: Record<AutoTopupKind, keyof AutoTopupConfig> = {
  KEY: "keyRefill",
  CHAT_CREDIT: "chatRefill",
  VOICE_SESSION: "voiceRefill",
  VIDEO_SESSION: "videoRefill",
}
const LABEL: Record<AutoTopupKind, string> = {
  KEY: "Key",
  CHAT_CREDIT: "ChatCredit",
  VOICE_SESSION: "Voice session",
  VIDEO_SESSION: "Video session",
}

// A decline or an unanswered STK prompt shouldn't be retried on every sweep —
// give the user (or their bank/M-PESA) a window before trying again.
const RETRY_COOLDOWN_MS = 30 * 60_000

export async function getAutoTopupConfig(userId: string) {
  return prisma.autoTopupConfig.findUnique({ where: { userId } })
}

export async function upsertAutoTopupConfig(
  userId: string,
  input: {
    enabled?: boolean
    method?: "CARD" | "MPESA"
    mpesaPhone?: string | null
    keyThreshold?: number
    keyRefill?: number
    chatThreshold?: number
    chatRefill?: number
    voiceThreshold?: number
    voiceRefill?: number
    videoThreshold?: number
    videoRefill?: number
  },
) {
  const existing = await prisma.autoTopupConfig.findUnique({ where: { userId } })
  const method = input.method ?? existing?.method ?? "MPESA"
  const enabled = input.enabled ?? existing?.enabled ?? false

  if (enabled && method === "MPESA") {
    const phone = input.mpesaPhone ?? existing?.mpesaPhone
    if (!phone) throw new Error("An M-PESA phone number is required to enable auto top-up")
  }
  if (enabled && method === "CARD" && !existing?.paystackAuthCode) {
    throw new Error("Save a card via a top-up first, then enable card auto top-up")
  }

  // Plain scalar fields only (never operation wrappers like `{ increment }`),
  // so the same object is valid for both the create and update branch below.
  const data: Record<string, string | number | boolean | null> = {}
  if (input.enabled !== undefined) data.enabled = input.enabled
  if (input.method !== undefined) data.method = input.method
  if (input.mpesaPhone !== undefined) data.mpesaPhone = input.mpesaPhone ? normalizePhone(input.mpesaPhone) : null
  if (input.keyThreshold !== undefined) data.keyThreshold = Math.max(0, Math.floor(input.keyThreshold))
  if (input.keyRefill !== undefined) data.keyRefill = Math.max(0, Math.floor(input.keyRefill))
  if (input.chatThreshold !== undefined) data.chatThreshold = Math.max(0, Math.floor(input.chatThreshold))
  if (input.chatRefill !== undefined) data.chatRefill = Math.max(0, Math.floor(input.chatRefill))
  if (input.voiceThreshold !== undefined) data.voiceThreshold = Math.max(0, Math.floor(input.voiceThreshold))
  if (input.voiceRefill !== undefined) data.voiceRefill = Math.max(0, Math.floor(input.voiceRefill))
  if (input.videoThreshold !== undefined) data.videoThreshold = Math.max(0, Math.floor(input.videoThreshold))
  if (input.videoRefill !== undefined) data.videoRefill = Math.max(0, Math.floor(input.videoRefill))

  return prisma.autoTopupConfig.upsert({
    where: { userId },
    create: { userId, ...data } as Prisma.AutoTopupConfigUncheckedCreateInput,
    update: data as Prisma.AutoTopupConfigUncheckedUpdateInput,
  })
}

/** Check one user's watched balances against their config and fire a refill if needed. Never throws. */
export async function runAutoTopupCheck(userId: string, kinds: readonly AutoTopupKind[] = AUTO_TOPUP_KINDS) {
  try {
    const [config, account] = await Promise.all([
      prisma.autoTopupConfig.findUnique({ where: { userId } }),
      prisma.creditAccount.findUnique({ where: { userId } }),
    ])
    if (!config?.enabled || !account) return
    if (config.lastTriggeredAt && Date.now() - config.lastTriggeredAt.getTime() < RETRY_COOLDOWN_MS) return

    const items: CartItems = {}
    for (const kind of kinds) {
      const threshold = config[THRESHOLD_FIELD[kind]] as number
      const refill = config[REFILL_FIELD[kind]] as number
      if (threshold <= 0 || refill <= 0) continue
      if ((account[BALANCE_FIELD[kind]] as number) > threshold) continue
      items[kind as CreditKind] = refill
    }
    if (Object.keys(items).length === 0) return

    if (config.method === "CARD") await triggerCardRefill(userId, config, items)
    else await triggerMpesaRefill(userId, config, items)
  } catch (error) {
    logError("auto-topup:check", error)
  }
}

/** Sweep every enabled config. Driven by the minutely in-process cron (server.mjs). */
export async function runAutoTopupSweep() {
  const configs = await prisma.autoTopupConfig.findMany({ where: { enabled: true }, select: { userId: true } })
  for (const { userId } of configs) {
    await runAutoTopupCheck(userId)
  }
  return { checked: configs.length }
}

async function priceItemsKes(items: CartItems) {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 }, select: { usdToKesRate: true } })
  const rate = Number(settings?.usdToKesRate ?? 130)
  const priceKes = purchasePriceKesFor(rate)
  const totalKes = Object.entries(items).reduce(
    (sum, [kind, qty]) => sum + priceKes[kind as CreditKind] * (qty ?? 0),
    0,
  )
  return { rate, totalKes }
}

async function triggerCardRefill(userId: string, config: AutoTopupConfig, items: CartItems) {
  if (!config.paystackAuthCode) {
    await recordFailure(userId, "No saved card on file for auto top-up")
    return
  }
  const { rate, totalKes } = await priceItemsKes(items)
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  const email = user?.email && user.email.includes("@") ? user.email : `user-${userId}@chatandtip.app`

  const purchase = await prisma.creditPurchase.create({
    data: {
      userId,
      phone: "",
      items: items as Prisma.InputJsonValue,
      totalKes: new Prisma.Decimal(totalKes),
      provider: "PAYSTACK",
      status: "PENDING",
      exchangeRate: rate,
      pricingSnapshot: {
        autoTopup: true,
        purchaseKes: purchasePriceKesFor(rate),
        creatorValueKes: ON_ACCOUNT_VALUE_KES,
        usdToKesRate: rate,
      } as Prisma.InputJsonValue,
    },
  })

  const result = await chargeAuthorization({
    authorizationCode: config.paystackAuthCode,
    amountKes: totalKes,
    email,
    reference: purchase.id,
  })
  await prisma.autoTopupConfig.update({ where: { userId }, data: { lastTriggeredAt: new Date() } })

  if (result.status === "success") {
    await allocateCredits({ userId, items, transactionId: purchase.id })
    await prisma.creditPurchase.update({ where: { id: purchase.id }, data: { status: "SUCCESS", allocated: true } })
    await notifyRefill(userId, items)
  } else {
    await prisma.creditPurchase.update({ where: { id: purchase.id }, data: { status: "FAILED" } })
    await recordFailure(userId, result.message)
  }
}

async function triggerMpesaRefill(userId: string, config: AutoTopupConfig, items: CartItems) {
  if (!config.mpesaPhone) {
    await recordFailure(userId, "No M-PESA number on file for auto top-up")
    return
  }
  try {
    // M-PESA can't be charged off-session — this sends the STK prompt for the
    // user to approve with their PIN. Fulfillment happens via the existing
    // STK callback path once they do, same as a manual top-up.
    const result = await initiateCreditPurchase({ userId, phone: config.mpesaPhone, items })
    await prisma.autoTopupConfig.update({ where: { userId }, data: { lastTriggeredAt: new Date() } })
    if (!result.success) {
      await recordFailure(userId, result.message || "M-PESA prompt failed to send")
      return
    }
    await createUserNotification({
      userId,
      title: "Low balance",
      message: "Check your phone to approve the M-PESA prompt and top up.",
      type: "auto_topup",
      metadata: { autoTopup: true, items },
    })
  } catch (error) {
    await prisma.autoTopupConfig.update({ where: { userId }, data: { lastTriggeredAt: new Date() } })
    await recordFailure(userId, error instanceof Error ? error.message : "M-PESA prompt failed to send")
  }
}

async function recordFailure(userId: string, message: string) {
  await prisma.autoTopupConfig.update({
    where: { userId },
    data: { lastFailureAt: new Date(), lastFailureText: message.slice(0, 500) },
  })
  await createUserNotification({
    userId,
    title: "Auto top-up failed",
    message,
    type: "auto_topup",
    metadata: { autoTopup: true, failed: true },
  })
}

async function notifyRefill(userId: string, items: CartItems) {
  const label = Object.entries(items)
    .map(([kind, qty]) => `${qty} ${LABEL[kind as AutoTopupKind]}${(qty ?? 0) > 1 ? "s" : ""}`)
    .join(", ")
  await createUserNotification({
    userId,
    title: "Auto top-up complete",
    message: `Added ${label} to your account.`,
    type: "auto_topup",
    metadata: { autoTopup: true, items },
  })
}
