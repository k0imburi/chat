import "server-only"

import { CreatorPayout, EarningLotStatus, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { env } from "@/lib/env"
import { fetchMpesaAccessToken, normalizePhone, resolveMpesaConfig } from "@/lib/mpesa"
import { createWithdrawalRequest, getWithdrawalQuote, signWithdrawalQuote } from "@/lib/mobile-wallet"

export async function matureEarningLots(now = new Date()) {
  return prisma.earningLot.updateMany({ where: { status: "PENDING", availableAt: { lte: now } }, data: { status: "AVAILABLE" } })
}

export async function financeSummary(userId: string) {
  await matureEarningLots()
  const [lots, payouts, settings, kyc, profile, reservedAllocations, outstandingFines] = await Promise.all([
    // Grouped by source too (TIP/KEY/CHAT_CREDIT/VOICE_SESSION/VIDEO_SESSION)
    // so the wallet can show a per-category breakdown of what a creator has
    // earned — these lots only ever belong to the earning creator (never the
    // paying user's own topped-up CreditAccount), so there's no risk of
    // earned and topped-up balances mixing.
    prisma.earningLot.groupBy({ by: ["status", "currency", "source"], where: { userId }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.creatorPayout.aggregate({ where: { userId, status: "SUCCEEDED" }, _sum: { amount: true } }),
    prisma.appSettings.findUnique({ where: { id: 1 } }),
    prisma.creatorKyc.findUnique({ where: { userId } }),
    prisma.payoutProfile.findUnique({ where: { userId } }),
    prisma.payoutAllocation.findMany({
      where: { earningLot: { userId }, status: "RESERVED" },
      select: { amountKes: true },
    }),
    prisma.creatorFine.aggregate({
      where: { creatorId: userId, status: "OUTSTANDING" },
      _sum: { amount: true },
    }),
  ])
  const rate = Number(settings?.usdToKesRate || 0)
  const toKes = (amount: number, currency: string) => currency === "USD" ? amount * rate : amount
  const sum = (statuses: string[]) => lots.filter((r) => statuses.includes(r.status)).reduce((n, r) => n + toKes(Number(r._sum.amount || 0), r.currency), 0)
  const reservedAllocationKes = reservedAllocations.reduce((total, row) => total + Number(row.amountKes), 0)
  const outstandingFinesKes = Number(outstandingFines._sum.amount || 0)
  const maturedAvailableKes = Math.max(0, sum(["AVAILABLE"]) - reservedAllocationKes)
  const withdrawableKes = Math.max(0, maturedAvailableKes - outstandingFinesKes)

  // Still-on-the-books total (not yet paid out) broken down by what earned it.
  const currentStatuses: EarningLotStatus[] = ["PENDING", "HELD", "AVAILABLE", "RESERVED"]
  const bySourceKes: Record<string, number> = {}
  const itemSources = ["TIP_PEBBLE", "TIP_GEM", "TIP_DIAMOND", "KEY", "CHAT_CREDIT", "VOICE_SESSION", "VIDEO_SESSION"] as const
  type EarningItemSource = (typeof itemSources)[number]
  type ItemMaturity = { maturing: number; available: number; held: number; processing: number; paidOut: number }
  const emptyMaturity = (): ItemMaturity => ({ maturing: 0, available: 0, held: 0, processing: 0, paidOut: 0 })
  const earningItemCounts: Record<string, number> = Object.fromEntries(itemSources.map((source) => [source, 0]))
  const earningItemMaturity: Record<string, ItemMaturity> = Object.fromEntries(itemSources.map((source) => [source, emptyMaturity()]))
  const recordItem = (source: EarningItemSource, status: EarningLotStatus, count: number) => {
    earningItemCounts[source] += count
    const maturity = earningItemMaturity[source]
    switch (status) {
      case "AVAILABLE": maturity.available += count; break
      case "HELD": maturity.held += count; break
      case "RESERVED": maturity.processing += count; break
      case "PAID": maturity.paidOut += count; break
      default: maturity.maturing += count
    }
  }
  for (const row of lots) {
    if (row.source !== "TIP" && itemSources.includes(row.source as EarningItemSource)) {
      recordItem(row.source as EarningItemSource, row.status, row._count._all)
    }
    if (currentStatuses.includes(row.status)) {
      bySourceKes[row.source] = (bySourceKes[row.source] ?? 0) + toKes(Number(row._sum.amount || 0), row.currency)
    }
  }

  // Split the TIP bucket by tier (Pebble/Gem/Diamond) — EarningLot only
  // stores a generic "TIP" source, so join each lot's sourceId back to the
  // Tip row it came from to find out which tier actually earned it.
  if (lots.some((lot) => lot.source === "TIP")) {
    const tipLots = await prisma.earningLot.findMany({
      where: { userId, source: "TIP" },
      select: { sourceId: true, amount: true, currency: true, status: true },
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
        if (currentStatuses.includes(lot.status)) unmatched += kes
        continue
      }
      const key = `TIP_${tier}`
      if (currentStatuses.includes(lot.status)) {
        bySourceKes[key] = (bySourceKes[key] ?? 0) + kes
      }
      if (itemSources.includes(key as EarningItemSource)) {
        recordItem(key as EarningItemSource, lot.status, 1)
      }
    }
    delete bySourceKes.TIP
    if (unmatched) bySourceKes.TIP = unmatched
  }

  return {
    pendingEarningsKes: sum(["PENDING", "HELD"]),
    availableBalanceKes: withdrawableKes,
    maturedAvailableKes,
    outstandingFinesKes,
    withdrawableKes,
    currentBalanceKes: sum(currentStatuses),
    totalPaidOutKes: Number(payouts._sum.amount || 0),
    totalEarnedKes: sum(currentStatuses) + Number(payouts._sum.amount || 0),
    bySourceKes,
    earningItemCounts,
    earningItemMaturity,
    usdToKesRate: rate,
    withdrawalFeePercent: Number(settings?.withdrawalFeePercent ?? 0),
    kycStatus: kyc?.status || "NOT_SUBMITTED",
    payoutProfile: profile ? { mpesaPhone: profile.mpesaPhone, phoneVerified: Boolean(profile.phoneVerifiedAt), automaticEnabled: profile.automaticEnabled, pausedReason: profile.pausedReason } : null,
  }
}

// Per-earning detail for the wallet's "Earnings activity" list: what was
// earned, how much, who it was with (when resolvable), when it was received,
// and when it matures/became available.
export async function financeActivity(userId: string, opts?: { take?: number }) {
  const take = Math.min(Math.max(opts?.take ?? 50, 1), 200)
  const [lots, settings] = await Promise.all([
    prisma.earningLot.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take }),
    prisma.appSettings.findUnique({ where: { id: 1 } }),
  ])
  const rate = Number(settings?.usdToKesRate || 0)
  const toUsd = (amount: number, currency: string) => (currency === "USD" ? amount : rate > 0 ? amount / rate : 0)

  const tipLotIds = lots.filter((l) => l.source === "TIP").map((l) => l.sourceId)
  const bookingLotIds = lots.filter((l) => l.source === "VOICE_SESSION" || l.source === "VIDEO_SESSION").map((l) => l.sourceId)
  // KEY/CHAT_CREDIT lots store the raw idempotency key as sourceId — the
  // payer is recoverable from the matching "consume:<key>" ledger row.
  const creditSourceIds = lots.filter((l) => l.source === "KEY" || l.source === "CHAT_CREDIT").map((l) => l.sourceId)

  const [tips, bookings, ledgerRows] = await Promise.all([
    tipLotIds.length ? prisma.tip.findMany({ where: { id: { in: tipLotIds } }, select: { id: true, tier: true, senderId: true } }) : Promise.resolve([]),
    bookingLotIds.length ? prisma.callBooking.findMany({ where: { id: { in: bookingLotIds } }, select: { id: true, customerId: true, scheduledStart: true } }) : Promise.resolve([]),
    creditSourceIds.length
      ? prisma.creditLedger.findMany({ where: { idempotencyKey: { in: creditSourceIds.map((id) => `consume:${id}`) } }, select: { idempotencyKey: true, userId: true } })
      : Promise.resolve([]),
  ])

  const tipById = new Map(tips.map((t) => [t.id, t]))
  const bookingById = new Map(bookings.map((b) => [b.id, b]))
  const ledgerByKey = new Map(ledgerRows.map((l) => [l.idempotencyKey, l]))

  const counterpartyIds = new Set<string>()
  for (const t of tips) counterpartyIds.add(t.senderId)
  for (const b of bookings) counterpartyIds.add(b.customerId)
  for (const l of ledgerRows) counterpartyIds.add(l.userId)
  const counterparties = counterpartyIds.size
    ? await prisma.user.findMany({ where: { id: { in: [...counterpartyIds] } }, select: { id: true, fullName: true } })
    : []
  const nameById = new Map(counterparties.map((u) => [u.id, u.fullName]))

  const TIER_LABEL: Record<string, string> = { PEBBLE: "Pebble", GEM: "Gem", DIAMOND: "Diamond" }
  const items = lots.map((lot) => {
    let label = "Earning"
    let withName: string | null = null
    if (lot.source === "TIP") {
      const tip = tipById.get(lot.sourceId)
      withName = tip ? nameById.get(tip.senderId) ?? null : null
      label = tip ? `${TIER_LABEL[tip.tier] ?? "Tip"} tip` : "Tip"
    } else if (lot.source === "VOICE_SESSION" || lot.source === "VIDEO_SESSION") {
      const booking = bookingById.get(lot.sourceId)
      withName = booking ? nameById.get(booking.customerId) ?? null : null
      label = lot.source === "VOICE_SESSION" ? "Voice call" : "Video call"
    } else if (lot.source === "KEY" || lot.source === "CHAT_CREDIT") {
      const ledger = ledgerByKey.get(`consume:${lot.sourceId}`)
      withName = ledger ? nameById.get(ledger.userId) ?? null : null
      label = lot.source === "KEY" ? "Chat unlock" : "Chat reply"
    }
    return {
      id: lot.id,
      source: lot.source,
      label,
      withName,
      amountUsd: toUsd(Number(lot.amount), lot.currency),
      status: lot.status,
      receivedAt: lot.createdAt.toISOString(),
      maturesAt: lot.availableAt.toISOString(),
    }
  })

  return { items }
}

// Creator fines (session no-shows etc.) and strikes for the wallet's
// "Strikes & fines" section.
export async function financeFinesAndStrikes(userId: string) {
  const [fines, strikes, settings] = await Promise.all([
    prisma.creatorFine.findMany({
      where: { creatorId: userId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { booking: { select: { customerId: true, scheduledStart: true } } },
    }),
    prisma.creatorStrike.findMany({ where: { creatorId: userId }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.appSettings.findUnique({ where: { id: 1 } }),
  ])
  const rate = Number(settings?.usdToKesRate || 0)
  const toUsd = (amount: number, currency: string) => (currency === "USD" ? amount : rate > 0 ? amount / rate : 0)

  // CreatorStrike.bookingId has no Prisma relation, so resolve bookings and
  // their customers manually.
  const strikeBookingIds = strikes.map((s) => s.bookingId).filter((id): id is string => Boolean(id))
  const strikeBookings = strikeBookingIds.length
    ? await prisma.callBooking.findMany({ where: { id: { in: strikeBookingIds } }, select: { id: true, customerId: true } })
    : []
  const strikeBookingById = new Map(strikeBookings.map((b) => [b.id, b]))

  const customerIds = new Set<string>()
  for (const f of fines) customerIds.add(f.booking.customerId)
  for (const b of strikeBookings) customerIds.add(b.customerId)
  const customers = customerIds.size
    ? await prisma.user.findMany({ where: { id: { in: [...customerIds] } }, select: { id: true, fullName: true } })
    : []
  const nameById = new Map(customers.map((u) => [u.id, u.fullName]))

  const now = new Date()
  return {
    fines: fines.map((f) => ({
      id: f.id,
      amountUsd: toUsd(Number(f.amount), f.currency),
      reason: f.reason,
      status: f.status,
      withName: nameById.get(f.booking.customerId) ?? null,
      bookingAt: f.booking.scheduledStart.toISOString(),
      createdAt: f.createdAt.toISOString(),
    })),
    strikes: strikes.map((s) => {
      const booking = s.bookingId ? strikeBookingById.get(s.bookingId) : undefined
      return {
        id: s.id,
        reason: s.reason,
        withName: booking ? nameById.get(booking.customerId) ?? null : null,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt?.toISOString() ?? null,
        consumedAt: s.consumedAt?.toISOString() ?? null,
        active: !s.consumedAt && (!s.expiresAt || s.expiresAt > now),
      }
    }),
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
  const candidates = await prisma.user.findMany({ where: {
    kycProfile: { status: "APPROVED" }, payoutProfile: { automaticEnabled: true, phoneVerifiedAt: { not: null }, pausedReason: null },
    earningLots: { some: { status: "AVAILABLE" } },
  }, include: { payoutProfile: true } })
  const submitted: string[] = []
  for (const user of candidates) {
    if (!user.payoutProfile?.mpesaPhone || !user.payoutProfile.phoneVerifiedAt) continue
    if (user.payoutProfile.destinationChangedAt && Date.now() - user.payoutProfile.destinationChangedAt.getTime() < 24 * 3600_000) continue
    const recentFailures = await prisma.creatorPayout.count({ where: { userId: user.id, status: "FAILED", createdAt: { gte: new Date(Date.now() - 4 * 86_400_000) } } })
    if (recentFailures >= 3) {
      await prisma.payoutProfile.update({ where: { userId: user.id }, data: { pausedReason: "Payout paused after three failed daily batches; please verify the M-PESA destination" } })
      continue
    }
    const balance = await getWithdrawalQuote(user.id, 0.01)
    const grossUsd = Number(balance.withdrawableUsd)
    if (grossUsd <= 0) continue
    const quote = await getWithdrawalQuote(user.id, grossUsd)
    if (quote.netUsd.lt(40)) continue
    const withdrawal = await createWithdrawalRequest({
      userId: user.id,
      amount: grossUsd,
      method: "MPESA_B2C",
      destination: user.payoutProfile.mpesaPhone,
      expectedRate: Number(quote.rate),
      expectedFeePercent: Number(quote.feePercent),
      quoteToken: await signWithdrawalQuote({
        userId: user.id,
        grossUsd: quote.grossUsd,
        rate: quote.rate,
        feePercent: quote.feePercent,
        expiresAt: quote.expiresAt,
      }),
      metadata: { automatic: true },
    })
    const payout = await prisma.creatorPayout.update({
      where: { id: withdrawal.creatorPayoutId! },
      data: { attempts: 1 },
    })
    try {
      const provider = await mpesaB2c(payout)
      await prisma.creatorPayout.update({ where: { id: payout.id }, data: { providerReference: String(provider.ConversationID || provider.OriginatorConversationID || payout.id) } })
      submitted.push(payout.id)
    } catch (error) {
      await prisma.$transaction([
        prisma.creatorPayout.update({ where: { id: payout.id }, data: { status: "FAILED", failureReason: error instanceof Error ? error.message : "Provider failed" } }),
        prisma.payoutAllocation.updateMany({ where: { payoutId: payout.id }, data: { status: "RELEASED" } }),
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
    const allocations = await tx.payoutAllocation.findMany({ where: { payoutId } })
    await tx.payoutAllocation.updateMany({ where: { payoutId, status: "RESERVED" }, data: { status: success ? "PAID" : "RELEASED" } })
    if (success) {
      const withdrawal = await tx.withdrawalRequest.findUnique({ where: { creatorPayoutId: payoutId } })
      const metadata = withdrawal?.metadata && typeof withdrawal.metadata === "object" && !Array.isArray(withdrawal.metadata)
        ? withdrawal.metadata as Record<string, unknown>
        : {}
      const fineIds = Array.isArray(metadata.fineIds) ? metadata.fineIds.filter((id): id is string => typeof id === "string") : []
      if (fineIds.length) {
        await tx.creatorFine.updateMany({ where: { id: { in: fineIds }, status: "OUTSTANDING" }, data: { status: "SETTLED", settledAt: new Date() } })
      }
      for (const allocation of allocations) {
        const lot = await tx.earningLot.findUnique({ where: { id: allocation.earningLotId } })
        if (!lot) continue
        const paid = await tx.payoutAllocation.aggregate({ where: { earningLotId: lot.id, status: "PAID" }, _sum: { amount: true } })
        if (new Prisma.Decimal(paid._sum.amount || 0).gte(lot.amount)) {
          await tx.earningLot.update({ where: { id: lot.id }, data: { status: "PAID" } })
        }
      }
    } else {
      await tx.earningLot.updateMany({ where: { payoutId }, data: { status: "AVAILABLE", payoutId: null } })
    }
    return tx.creatorPayout.update({ where: { id: payoutId }, data: { status: success ? "SUCCEEDED" : "FAILED", providerReference: reference, failureReason: reason, processedAt: new Date() } })
  })
}
