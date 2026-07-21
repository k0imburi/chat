import "server-only"

import { CreatorPayout, EarningLotStatus, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { env } from "@/lib/env"
import { fetchMpesaAccessToken, normalizePhone, resolveMpesaConfig } from "@/lib/mpesa"

export async function matureEarningLots(now = new Date()) {
  return prisma.earningLot.updateMany({ where: { status: "PENDING", availableAt: { lte: now } }, data: { status: "AVAILABLE" } })
}

export async function financeSummary(userId: string) {
  await matureEarningLots()
  const [lots, payouts, settings, kyc, profile] = await Promise.all([
    // Grouped by source too (TIP/KEY/CHAT_CREDIT/VOICE_SESSION/VIDEO_SESSION)
    // so the wallet can show a per-category breakdown of what a creator has
    // earned — these lots only ever belong to the earning creator (never the
    // paying user's own topped-up CreditAccount), so there's no risk of
    // earned and topped-up balances mixing.
    prisma.earningLot.groupBy({ by: ["status", "currency", "source"], where: { userId }, _sum: { amount: true } }),
    prisma.creatorPayout.aggregate({ where: { userId, status: "SUCCEEDED" }, _sum: { amount: true } }),
    prisma.appSettings.findUnique({ where: { id: 1 } }),
    prisma.creatorKyc.findUnique({ where: { userId } }),
    prisma.payoutProfile.findUnique({ where: { userId } }),
  ])
  const rate = Number(settings?.usdToKesRate || 0)
  const toKes = (amount: number, currency: string) => currency === "USD" ? amount * rate : amount
  const sum = (statuses: string[]) => lots.filter((r) => statuses.includes(r.status)).reduce((n, r) => n + toKes(Number(r._sum.amount || 0), r.currency), 0)

  // Still-on-the-books total (not yet paid out) broken down by what earned it.
  const currentStatuses: EarningLotStatus[] = ["PENDING", "HELD", "AVAILABLE", "RESERVED"]
  const bySourceKes: Record<string, number> = {}
  for (const row of lots) {
    if (!currentStatuses.includes(row.status)) continue
    bySourceKes[row.source] = (bySourceKes[row.source] ?? 0) + toKes(Number(row._sum.amount || 0), row.currency)
  }

  // Split the TIP bucket by tier (Pebble/Gem/Diamond) — EarningLot only
  // stores a generic "TIP" source, so join each lot's sourceId back to the
  // Tip row it came from to find out which tier actually earned it.
  if (bySourceKes.TIP) {
    const tipLots = await prisma.earningLot.findMany({
      where: { userId, source: "TIP", status: { in: currentStatuses } },
      select: { sourceId: true, amount: true, currency: true },
    })
    const tips = await prisma.tip.findMany({
      where: { id: { in: tipLots.map((l) => l.sourceId) } },
      select: { id: true, tier: true },
    })
    const tierByTipId = new Map(tips.map((t) => [t.id, t.tier]))
    let unmatched = 0
    for (const lot of tipLots) {
      const tier = tierByTipId.get(lot.sourceId)
      const kes = toKes(Number(lot.amount), lot.currency)
      if (!tier) {
        unmatched += kes
        continue
      }
      const key = `TIP_${tier}`
      bySourceKes[key] = (bySourceKes[key] ?? 0) + kes
    }
    delete bySourceKes.TIP
    if (unmatched) bySourceKes.TIP = unmatched
  }

  return {
    pendingEarningsKes: sum(["PENDING", "HELD"]),
    availableBalanceKes: sum(["AVAILABLE"]),
    currentBalanceKes: sum(currentStatuses),
    totalPaidOutKes: Number(payouts._sum.amount || 0),
    bySourceKes,
    usdToKesRate: rate,
    kycStatus: kyc?.status || "NOT_SUBMITTED",
    payoutProfile: profile ? { mpesaPhone: profile.mpesaPhone, phoneVerified: Boolean(profile.phoneVerifiedAt), automaticEnabled: profile.automaticEnabled, pausedReason: profile.pausedReason } : null,
  }
}

export async function submitKyc(userId: string, input: { idFrontObjectKey: string; idBackObjectKey: string; selfieObjectKey: string }) {
  if (!input.idFrontObjectKey || !input.idBackObjectKey || !input.selfieObjectKey) throw new Error("ID front, ID back, and selfie are required")
  return prisma.creatorKyc.upsert({ where: { userId }, create: { userId, ...input, status: "PENDING", submittedAt: new Date() }, update: {
    ...input, status: "PENDING", submittedAt: new Date(), rejectionReason: null, reviewedAt: null, reviewerId: null,
  } })
}

async function mpesaB2c(payout: CreatorPayout) {
  const mpesa = await resolveMpesaConfig()
  const consumerKey = mpesa.consumerKey
  const consumerSecret = mpesa.consumerSecret
  const environment = mpesa.environment
  const shortcode = env.MPESA_B2C_SHORTCODE || mpesa.shortcode
  if (!consumerKey || !consumerSecret || !shortcode || !env.MPESA_B2C_INITIATOR_NAME || !env.MPESA_B2C_SECURITY_CREDENTIAL || !env.APP_URL) {
    throw new Error("M-PESA B2C settings are incomplete")
  }
  const token = await fetchMpesaAccessToken({ consumerKey, consumerSecret, shortcode, passkey: "", shortcodeType: "", storeNumber: "", environment })
  const base = environment === "live" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke"
  const response = await fetch(`${base}/mpesa/b2c/v3/paymentrequest`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({
    OriginatorConversationID: payout.id, InitiatorName: env.MPESA_B2C_INITIATOR_NAME,
    SecurityCredential: env.MPESA_B2C_SECURITY_CREDENTIAL, CommandID: "BusinessPayment",
    Amount: Math.floor(Number(payout.amount)), PartyA: shortcode, PartyB: normalizePhone(payout.destination),
    Remarks: "ChatAndTip creator payout", QueueTimeOutURL: `${env.APP_URL}/api/mpesa/b2c/timeout`,
    ResultURL: `${env.APP_URL}/api/mpesa/b2c/result`, Occasion: "Creator earnings",
  }), cache: "no-store" })
  const data = await response.json() as Record<string, unknown>
  if (!response.ok || String(data.ResponseCode ?? "") !== "0") throw new Error(String(data.ResponseDescription || "M-PESA B2C rejected payout"))
  return data
}

export async function runPayoutBatch() {
  await matureEarningLots()
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } })
  const rate = Number(settings?.usdToKesRate || 0)
  const thresholdKes = 40 * rate
  if (thresholdKes <= 0) throw new Error("USD to KES exchange rate must be configured")
  const candidates = await prisma.user.findMany({ where: {
    kycProfile: { status: "APPROVED" }, payoutProfile: { automaticEnabled: true, phoneVerifiedAt: { not: null }, pausedReason: null },
    OR: [{ earningSuspendedUntil: null }, { earningSuspendedUntil: { lte: new Date() } }],
    earningLots: { some: { status: "AVAILABLE" } },
  }, include: { payoutProfile: true, earningLots: { where: { status: "AVAILABLE" }, orderBy: { availableAt: "asc" } } } })
  const submitted: string[] = []
  for (const user of candidates) {
    if (!user.payoutProfile?.mpesaPhone || !user.payoutProfile.phoneVerifiedAt) continue
    if (user.payoutProfile.destinationChangedAt && Date.now() - user.payoutProfile.destinationChangedAt.getTime() < 24 * 3600_000) continue
    const recentFailures = await prisma.creatorPayout.count({ where: { userId: user.id, status: "FAILED", createdAt: { gte: new Date(Date.now() - 4 * 86_400_000) } } })
    if (recentFailures >= 3) {
      await prisma.payoutProfile.update({ where: { userId: user.id }, data: { pausedReason: "Payout paused after three failed daily batches; please verify the M-PESA destination" } })
      continue
    }
    const eligible = user.earningLots.filter((lot) => lot.currency === "KES" || rate > 0)
    const totalKes = eligible.reduce((n, lot) => n + Number(lot.amount) * (lot.currency === "USD" ? rate : 1), 0)
    if (totalKes < thresholdKes) continue
    const payout = await prisma.$transaction(async (tx) => {
      const row = await tx.creatorPayout.create({ data: { userId: user.id, amount: new Prisma.Decimal(totalKes), destination: user.payoutProfile!.mpesaPhone!, status: "PROCESSING", attempts: 1 } })
      await tx.earningLot.updateMany({ where: { id: { in: eligible.map((l) => l.id) }, status: "AVAILABLE" }, data: { status: "RESERVED", payoutId: row.id } })
      return row
    })
    try {
      const provider = await mpesaB2c(payout)
      await prisma.creatorPayout.update({ where: { id: payout.id }, data: { providerReference: String(provider.ConversationID || provider.OriginatorConversationID || payout.id) } })
      submitted.push(payout.id)
    } catch (error) {
      await prisma.$transaction([
        prisma.creatorPayout.update({ where: { id: payout.id }, data: { status: "FAILED", failureReason: error instanceof Error ? error.message : "Provider failed" } }),
        prisma.earningLot.updateMany({ where: { payoutId: payout.id }, data: { status: "AVAILABLE", payoutId: null } }),
      ])
    }
  }
  return { candidates: candidates.length, submitted }
}

export async function settlePayout(payoutId: string, success: boolean, reference?: string, reason?: string) {
  return prisma.$transaction(async (tx) => {
    const payout = await tx.creatorPayout.findUnique({ where: { id: payoutId } })
    if (!payout || ["SUCCEEDED", "FAILED"].includes(payout.status)) return payout
    await tx.earningLot.updateMany({ where: { payoutId }, data: success ? { status: "PAID" } : { status: "AVAILABLE", payoutId: null } })
    return tx.creatorPayout.update({ where: { id: payoutId }, data: { status: success ? "SUCCEEDED" : "FAILED", providerReference: reference, failureReason: reason, processedAt: new Date() } })
  })
}
