import {test} from 'node:test'
import assert from 'node:assert/strict'
import {encryptVaultValue,decryptVaultValue} from '../lib/vault-secret-crypto'
test('store credentials are encrypted and tampering is rejected',async()=>{
 const secret='example-private-material'
 const encrypted=await encryptVaultValue(secret,'test-secret')
 assert.equal(encrypted.includes(secret),false)
 assert.equal(await decryptVaultValue(encrypted,'test-secret'),secret)
 const parts=encrypted.split('.')
 parts[3]=(parts[3][0]==='A'?'B':'A')+parts[3].slice(1)
 await assert.rejects(decryptVaultValue(parts.join('.'),'test-secret'))
})
