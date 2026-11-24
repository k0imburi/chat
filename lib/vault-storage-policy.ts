/** Pure vault entitlement rules. Values are binary MiB, as in the current API. */
export const FREE_VAULT_BYTES = 300 * 1024 * 1024
export const REFERRAL_BONUS_BYTES = 200 * 1024 * 1024
export const REQUIRED_REFERRALS = 2
export const DEFAULT_VAULT_PLAN_GIB = [1, 3, 5, 10, 50, 100] as const

export type VaultSubscription = { totalBytes: number; expiresAt: Date; status: string }
export function vaultAllowance(bonusEarned: boolean, subscription: VaultSubscription | null, now: Date): number {
  const free = FREE_VAULT_BYTES + (bonusEarned ? REFERRAL_BONUS_BYTES : 0)
  if (!subscription || !['ACTIVE', 'CANCELLED'].includes(subscription.status) || subscription.expiresAt.getTime() <= now.getTime()) return free
  if (!Number.isSafeInteger(subscription.totalBytes) || subscription.totalBytes <= 0) throw new Error('Invalid storage plan capacity')
  return Math.max(free, subscription.totalBytes)
}
export function vaultUsage(usedBytes: number, limitBytes: number, incomingBytes = 0) {
  if (![usedBytes, limitBytes, incomingBytes].every(Number.isSafeInteger) || usedBytes < 0 || limitBytes <= 0 || incomingBytes < 0) throw new Error('Invalid storage usage')
  const remainingBytes = Math.max(0, limitBytes - usedBytes)
  return { usedBytes, limitBytes, remainingBytes, percentage: Math.min(100, Math.floor(usedBytes / limitBytes * 100)), exceeded: incomingBytes > remainingBytes }
}
export function referralAwardDue(completedDistinctReferrals: number, alreadyAwarded: boolean): boolean {
  if (!Number.isSafeInteger(completedDistinctReferrals) || completedDistinctReferrals < 0) throw new Error('Invalid referral count')
  return !alreadyAwarded && completedDistinctReferrals >= REQUIRED_REFERRALS
}
