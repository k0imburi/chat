"use server"

import { revalidatePath } from "next/cache"
import { UserRole } from "@prisma/client"
import { requireSessionUser } from "@/lib/auth"
import { createUserNotification } from "@/lib/mobile-notifications"
import { prisma } from "@/lib/prisma"
import { startAdSchedule } from "@/lib/ad-schedule"
import { publishAd } from "@/lib/mobile-ads"
import { Prisma } from "@prisma/client"
import { z } from "zod"

async function requireAdReviewer() {
  const session = await requireSessionUser()
  if (session.role !== UserRole.SUPER_ADMIN && session.role !== UserRole.ADMIN && session.role !== UserRole.SUPPORT) {
    throw new Error("Ad reviewer access required")
  }
  return session
}

export async function reviewAdCampaignAction(input: {
  campaignId: string
  approved: boolean
  reason?: string
}) {
  const reviewer = await requireAdReviewer()
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM AdCampaign WHERE id=${input.campaignId} FOR UPDATE`
    const ad = await tx.adCampaign.findUniqueOrThrow({ where: { id: input.campaignId } })
    if (ad.isTest) throw new Error("Use the test campaign controls.")
    const now = new Date()
    const mayRun = input.approved && ad.checkoutPaid && ad.fundedMicros > ad.spentMicros &&
      (ad.status === 'PENDING_REVIEW' || ad.publishedAt !== null) &&
      (!ad.publishedAt || Boolean(ad.endDate && ad.endDate > now))
    const dailyBudget = ad.dailyBudgetMicros > 0n ? ad.dailyBudgetMicros : ad.budgetMicros
    const capacity = dailyBudget > 0n ? (dailyBudget / 12n > 0n ? dailyBudget / 12n : 1n) : 0n
    return tx.adCampaign.update({
      where: { id: ad.id },
      data: {
        reviewStatus: input.approved ? "APPROVED" : "REJECTED",
        reviewReason: input.approved ? null : input.reason || "The promotion did not meet advertising policy.",
        reviewedAt: now,
        reviewedById: reviewer.id,
        status: input.approved ? (mayRun ? "ACTIVE" : "DRAFT") : "REJECTED",
        ...(mayRun ? startAdSchedule(ad, now) : {}),
        ...(input.approved ? {
          pacingTokensMicros: capacity,
          pacingSpentMicros: 0n,
          pacingUpdatedAt: now,
          pacingDay: null,
        } : {}),
      },
    })
  })
  if (!input.approved) {
    await createUserNotification({
      userId: result.ownerId,
      type: "alert",
      title: "Promotion needs attention",
      message: `Your promotion “${result.name}” was not approved. ${result.reviewReason}`,
      metadata: { campaignId: result.id },
    })
  }
  return result
}

export async function startTestAdAction(input: {
  campaignId: string; testerUsernames?: string[]; allUsers?: boolean; durationHours: number
}) {
  const admin = await requireSessionUser()
  if (admin.role !== UserRole.ADMIN && admin.role !== UserRole.SUPER_ADMIN) {
    throw new Error("Administrator access required")
  }
  const parsed = z.object({
    campaignId: z.string().min(1),
    testerUsernames: z.array(z.string().trim().min(1).max(191)).max(10).default([]),
    allUsers: z.boolean().default(false),
    durationHours: z.number().int().min(1).max(720),
  }).parse(input)
  if (!parsed.allUsers && !parsed.testerUsernames.length) {
    throw new Error("Choose all active users or enter at least one tester username.")
  }
  const usernames = [...new Set(parsed.testerUsernames.map(name => name.replace(/^@/, '').toLowerCase()))]
  const source = await prisma.adCampaign.findUniqueOrThrow({ where: { id: parsed.campaignId } })
  if (source.isTest) throw new Error("Start a new test from the original campaign.")
  let testViewerIds: string[]
  if (parsed.allUsers) {
    testViewerIds = ["*"]
  } else {
    const testers = await prisma.user.findMany({
      where: { username: { in: usernames }, isActive: true, status: { notIn: ['BLOCKED', 'HIDDEN'] } },
      select: { id: true, username: true },
    })
    if (testers.length !== usernames.length || testers.some(user => user.id === source.ownerId)) {
      throw new Error("Choose existing active tester usernames other than the advertiser.")
    }
    testViewerIds = testers.map(user => user.id)
  }
  const creative = source.creative as Prisma.JsonObject | null
  if (!creative || !Array.isArray(source.mediaUrls) || !source.mediaUrls.length) {
    throw new Error("This campaign needs valid creative before it can be tested.")
  }
  const now = new Date()
  const daily = source.dailyBudgetMicros > 0n ? source.dailyBudgetMicros : source.budgetMicros
  if (daily <= 0n) throw new Error("This campaign needs a valid budget.")
  // Isolated simulated funds, never a payment or a credit to the advertiser.
  const testDaily = daily
  const testBudget = source.budgetMicros > 0n ? source.budgetMicros : daily
  const copy = await prisma.adCampaign.create({ data: {
    ownerId: source.ownerId, name: `[TEST] ${source.name}`.slice(0, 191),
    caption: source.caption, mediaUrls: source.mediaUrls as Prisma.InputJsonValue,
    websiteUrl: source.websiteUrl, ctaLabel: source.ctaLabel, language: source.language,
    countries: source.countries as Prisma.InputJsonValue, subjects: source.subjects as Prisma.InputJsonValue,
    creative: { ...creative, taggedUserIds: [], taggedUsernames: [], sourceCampaignId: source.id },
    metric: source.metric, rate: source.rate, bidMultiplier: source.bidMultiplier,
    timezoneOffsetMinutes: source.timezoneOffsetMinutes,
    isTest: true, testViewerIds, autoRenew: false,
    checkoutPaid: false, budgetMicros: testBudget, dailyBudgetMicros: testDaily,
    fundedMicros: testBudget, spentMicros: 0n,
    reviewStatus: 'APPROVED', reviewedById: admin.id, reviewedAt: now,
    status: 'DRAFT', publishedAt: now, startDate: now,
    endDate: new Date(now.getTime() + parsed.durationHours * 3600000),
  } })
  try {
    await publishAd(copy.ownerId, copy.id, true)
  } catch (error) {
    await prisma.adCampaign.delete({ where: { id: copy.id } })
    throw error
  }
  return { campaignId: copy.id }
}

export async function resetAllApprovedAdsAsTestAction(durationHours: number) {
  const admin = await requireSessionUser()
  if (admin.role !== UserRole.ADMIN && admin.role !== UserRole.SUPER_ADMIN) {
    throw new Error("Administrator access required")
  }
  const duration = z.number().int().min(1).max(720).parse(durationHours)
  const now = new Date()
  const [sources, existingTests] = await Promise.all([
    prisma.adCampaign.findMany({
      where: { isTest: false, reviewStatus: "APPROVED" },
      select: { id: true, budgetMicros: true, dailyBudgetMicros: true },
    }),
    prisma.adCampaign.findMany({
      where: { isTest: true, status: "ACTIVE" },
      select: { id: true, creative: true },
    }),
  ])
  const previousTests = existingTests.flatMap(({ id, creative }) => {
    const value = creative as Record<string, unknown> | null
    return typeof value?.sourceCampaignId === "string"
      ? [{ id, sourceCampaignId: value.sourceCampaignId }]
      : []
  })
  const eligible = sources.filter(source => source.budgetMicros > 0n || source.dailyBudgetMicros > 0n)
  let started = 0
  const failed: string[] = []
  for (const source of eligible) {
    try {
      const { campaignId } = await startTestAdAction({ campaignId: source.id, allUsers: true, durationHours: duration })
      for (const oldCopy of previousTests.filter(test => test.sourceCampaignId === source.id)) {
        if (oldCopy.id !== campaignId) await stopTestAdAction(oldCopy.id)
      }
      started++
    } catch (error) {
      failed.push(`${source.id}: ${error instanceof Error ? error.message : "test start failed"}`)
    }
  }
  revalidatePath("/ad-reviews")
  return { started, failed }
}

export async function stopTestAdAction(campaignId: string) {
  const admin = await requireSessionUser()
  if (admin.role !== UserRole.ADMIN && admin.role !== UserRole.SUPER_ADMIN) {
    throw new Error("Administrator access required")
  }
  const result = await prisma.adCampaign.updateMany({
    where: { id: campaignId, isTest: true },
    data: { status: 'COMPLETED', endDate: new Date(), autoRenew: false },
  })
  if (!result.count) throw new Error("Test campaign not found.")
  return { stopped: true }
}
