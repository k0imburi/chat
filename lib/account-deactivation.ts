import "server-only"

import { Prisma, UserStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { canReactivateAccount, scheduledDeletionAt } from "@/lib/account-deactivation-policy"

export async function deactivateAccount(userId: string, now = new Date()) {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      isActive: false,
      status: UserStatus.HIDDEN,
      deactivatedAt: now,
      scheduledDeletionAt: scheduledDeletionAt(now),
      accountPurgedAt: null,
      deviceToken: null,
      deviceSystem: null,
    },
    select: { deactivatedAt: true, scheduledDeletionAt: true },
  })
  return updated
}

export async function reactivateAccountForLogin<T extends {
  id: string; deactivatedAt: Date | null; scheduledDeletionAt: Date | null; accountPurgedAt: Date | null
}>(user: T, now = new Date()): Promise<T> {
  if (!user.deactivatedAt) return user
  if (!canReactivateAccount(user, now)) throw new Error("This account's recovery window has expired")
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { isActive: true, status: UserStatus.ACTIVE, deactivatedAt: null, scheduledDeletionAt: null },
    include: { media: true },
  })
  return updated as unknown as T
}

export async function purgeExpiredDeactivatedAccounts(now = new Date()) {
  const expired = await prisma.user.findMany({
    where: { deactivatedAt: { not: null }, scheduledDeletionAt: { lte: now }, accountPurgedAt: null },
    select: { id: true }, take: 100,
  })
  for (const { id } of expired) {
    await prisma.$transaction(async (tx) => {
      await tx.providerAccount.deleteMany({ where: { userId: id } })
      await tx.userMedia.deleteMany({ where: { userId: id } })
      await tx.videoComment.deleteMany({ where: { authorId: id } })
      await tx.follow.deleteMany({ where: { OR: [{ followerId: id }, { followedId: id }] } })
      await tx.userBlock.deleteMany({ where: { OR: [{ blockerId: id }, { blockedId: id }] } })
      await tx.user.update({
        where: { id },
        data: {
          externalId: null, fullName: "Deleted account", username: null, email: null,
          phoneNumber: null, passwordHash: null, avatarUrl: null, bio: null,
          country: null, city: null, latitude: null, longitude: null,
          interests: Prisma.DbNull, links: Prisma.DbNull, filter: Prisma.DbNull,
          deviceToken: null, deviceSystem: null,
          isActive: false, status: UserStatus.HIDDEN, accountPurgedAt: now,
        },
      })
    })
  }
  return expired.length
}
