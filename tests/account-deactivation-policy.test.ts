import assert from "node:assert/strict"
import test from "node:test"
import { canReactivateAccount, scheduledDeletionAt } from "../lib/account-deactivation-policy"

test("scheduled deletion is exactly 45 days after deactivation", () => {
  const start = new Date("2026-03-01T01:30:00.000Z")
  assert.equal(scheduledDeletionAt(start).toISOString(), "2026-04-15T01:30:00.000Z")
})

test("reactivation is allowed before, but not at, the deadline", () => {
  const deactivatedAt = new Date("2026-01-01T00:00:00.000Z")
  const deletion = scheduledDeletionAt(deactivatedAt)
  const account = { deactivatedAt, scheduledDeletionAt: deletion, accountPurgedAt: null }
  assert.equal(canReactivateAccount(account, new Date(deletion.getTime() - 1)), true)
  assert.equal(canReactivateAccount(account, deletion), false)
  assert.equal(canReactivateAccount({ ...account, accountPurgedAt: new Date() }, new Date(deletion.getTime() - 1)), false)
})
