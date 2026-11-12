import "server-only"

import { prisma } from "@/lib/prisma"

const DEFAULT_LIMIT_MB = 1024

export async function storageQuota(userId: string, incomingBytes = 0) {
  const [settings, aggregate] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: 1 }, select: { freeStorageLimitMb: true } }),
    prisma.asset.aggregate({
      where: { metadata: { path: "$.userId", equals: userId } },
      _sum: { sizeBytes: true },
    }),
  ])
  const limitBytes = Math.max(1, settings?.freeStorageLimitMb ?? DEFAULT_LIMIT_MB) * 1024 * 1024
  const usedBytes = Number(aggregate._sum.sizeBytes ?? 0)
  return { usedBytes, limitBytes, remainingBytes: Math.max(0, limitBytes - usedBytes), exceeded: usedBytes + incomingBytes > limitBytes }
}

export async function assertStorageAvailable(userId: string, incomingBytes: number) {
  const quota = await storageQuota(userId, incomingBytes)
  if (quota.exceeded) {
    const error = new Error("Your cloud storage is full. Upgrade your storage to upload more files.") as Error & { status?: number }
    error.status = 413
    throw error
  }
  return quota
}
