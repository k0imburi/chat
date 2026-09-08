export const ACCOUNT_RECOVERY_DAYS = 45

export function scheduledDeletionAt(from: Date) {
  return new Date(from.getTime() + ACCOUNT_RECOVERY_DAYS * 24 * 60 * 60 * 1000)
}

export function canReactivateAccount(
  account: { deactivatedAt: Date | null; scheduledDeletionAt: Date | null; accountPurgedAt: Date | null },
  now: Date,
) {
  return Boolean(
    account.deactivatedAt && account.scheduledDeletionAt && !account.accountPurgedAt &&
      account.scheduledDeletionAt.getTime() > now.getTime(),
  )
}
