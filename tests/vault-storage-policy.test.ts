import test from 'node:test'
import assert from 'node:assert/strict'
import { FREE_VAULT_BYTES, REFERRAL_BONUS_BYTES, DEFAULT_VAULT_PLAN_GIB, vaultAllowance, vaultUsage, referralAwardDue } from '../lib/vault-storage-policy'
const now = new Date('2026-01-01T00:00:00Z')
test('referral bonus is once-only after two completed signups', () => {
  assert.equal(referralAwardDue(1, false), false)
  assert.equal(referralAwardDue(2, false), true)
  assert.equal(referralAwardDue(50, true), false)
  assert.equal(vaultAllowance(true, null, now), FREE_VAULT_BYTES + REFERRAL_BONUS_BYTES)
})
test('active plan is total capacity and expiry falls back to earned free allowance', () => {
  const sub = {status: 'ACTIVE', totalBytes: 1024 ** 3, expiresAt: new Date('2026-02-01T00:00:00Z')}
  assert.equal(vaultAllowance(true, sub, now), 1024 ** 3)
  assert.equal(vaultAllowance(true, sub, sub.expiresAt), FREE_VAULT_BYTES + REFERRAL_BONUS_BYTES)
  assert.equal(vaultAllowance(false, {...sub, status: 'CANCELLED'}, now), 1024 ** 3)
  assert.equal(vaultAllowance(false, {...sub, status: 'REVOKED'}, now), FREE_VAULT_BYTES)
  assert.deepEqual(DEFAULT_VAULT_PLAN_GIB, [1, 3, 5, 10, 50, 100])
})
test('over-limit accounts keep usage and cannot upload additional bytes', () => {
  const quota = vaultUsage(600, 500, 1)
  assert.equal(quota.percentage, 100)
  assert.equal(quota.exceeded, true)
  assert.equal(vaultUsage(499, 500, 1).exceeded, false)
  assert.throws(() => vaultUsage(-1, 500))
})
