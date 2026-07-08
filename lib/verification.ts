import "server-only"

import { prisma } from "@/lib/prisma"
import { env } from "@/lib/env"
import { CompareFacesResult, compareFacesBytes, fetchBytesFromUrl, fetchPrivateR2Bytes } from "@/lib/rekognition"

export class NeedsAvatarError extends Error {
  code = "NEEDS_AVATAR" as const
  constructor() { super("User has no profile avatar") }
}

export async function getLivenessStatus(userId: string) {
  const record = await prisma.livenessVerification.findUnique({ where: { userId } })
  return {
    status: record?.status ?? "NOT_SUBMITTED",
    similarity: record?.similarity ? Number(record.similarity) : null,
    submittedAt: record?.submittedAt ?? null,
    reviewedAt: record?.reviewedAt ?? null,
    rejectionReason: record?.rejectionReason ?? null,
  }
}

export async function submitLivenessVerification(
  userId: string,
  input: { liveSelfieObjectKey: string; challengesPassed: string[]; clientLivenessPassed: boolean },
) {
  const { liveSelfieObjectKey, challengesPassed, clientLivenessPassed } = input

  // Ownership: key must start with private/{userId}/
  if (!liveSelfieObjectKey.startsWith(`private/${userId}/`)) {
    throw new Error("Invalid selfie key")
  }

  // Rate-limit: max 5 submissions per 24h
  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const existing = await prisma.livenessVerification.findUnique({ where: { userId } })
  if (existing) {
    const attemptWindowStart = existing.attemptWindowStart ?? existing.createdAt
    const inWindow = attemptWindowStart > windowStart
    const count = inWindow ? (existing.attemptCount ?? 0) : 0
    if (count >= 5) throw new Error("Too many verification attempts. Please try again tomorrow.")
  }

  // Avatar check
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } })
  if (!user?.avatarUrl) throw new NeedsAvatarError()

  // Fetch both images
  const [selfieBytes, avatarBytes] = await Promise.all([
    fetchPrivateR2Bytes(liveSelfieObjectKey),
    fetchBytesFromUrl(user.avatarUrl),
  ])

  // Rekognition compare
  const fallbackResult: CompareFacesResult = { similarity: 0, matched: false, lowQuality: false }
  let compareResult: CompareFacesResult = fallbackResult
  let reviewNote: string | null = null

  try {
    compareResult = await compareFacesBytes(selfieBytes, avatarBytes)
  } catch {
    reviewNote = "AUTO_REVIEW_ERROR: Rekognition call failed"
  }

  const AUTO_APPROVE_THRESHOLD = env.LIVENESS_AUTO_APPROVE_SIMILARITY
  const MISMATCH_THRESHOLD = env.LIVENESS_MISMATCH_SIMILARITY

  let autoDecision = "REVIEW"
  if (reviewNote === null) {
    if (compareResult.lowQuality) {
      reviewNote = "Low quality image or no face detected"
    } else if (clientLivenessPassed && compareResult.similarity >= AUTO_APPROVE_THRESHOLD) {
      autoDecision = "APPROVE"
    } else if (compareResult.similarity < MISMATCH_THRESHOLD && clientLivenessPassed) {
      reviewNote = "Liveness passed but face does not match profile avatar"
    }
  }

  const newStatus = autoDecision === "APPROVE" ? "APPROVED" : "PENDING"
  const now = new Date()

  const upsertData = {
    status: newStatus as "APPROVED" | "PENDING",
    liveSelfieObjectKey,
    similarity: compareResult.similarity,
    clientLivenessPassed,
    challengesPassed,
    autoDecision,
    reviewNote,
    submittedAt: now,
    attemptCount: (existing?.attemptCount ?? 0) + 1,
    attemptWindowStart: existing?.attemptWindowStart && existing.attemptWindowStart > windowStart
      ? existing.attemptWindowStart
      : now,
  }

  // Liveness/selfie is KYC (used to gate payouts) — it does NOT grant the
  // verified badge. The blue check is admin-granted; the gold check is the
  // official/broadcast account. So we only persist the KYC record here.
  await prisma.livenessVerification.upsert({
    where: { userId },
    create: { userId, ...upsertData },
    update: upsertData,
  })

  return { status: newStatus, similarity: compareResult.similarity, autoDecision }
}
