import {test} from 'node:test'
import assert from 'node:assert/strict'
import {vaultPlanExpiry,appleVaultAccountToken} from '../lib/vault-billing-policy'
test('monthly expiry clamps dates that do not exist in the next month',()=>{
 assert.equal(vaultPlanExpiry(new Date('2026-01-31T12:00:00Z'),'MONTHLY').toISOString(),'2026-02-28T12:00:00.000Z')
})
test('yearly expiry handles leap day',()=>{
 assert.equal(vaultPlanExpiry(new Date('2024-02-29T12:00:00Z'),'YEARLY').toISOString(),'2025-02-28T12:00:00.000Z')
})

test('Apple account identifier is deterministic and does not contain the user ID',()=>{
 assert.equal(appleVaultAccountToken('test-user'), 'f85ac825-d102-49f2-8546-aa1679ea991a')
})
