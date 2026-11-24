import 'server-only'
import {env} from '@/lib/env'
import {encryptVaultValue,decryptVaultValue} from '@/lib/vault-secret-crypto'
export const encryptVaultSecret=(value:string)=>encryptVaultValue(value,env.JWT_SECRET)
export const decryptVaultSecret=(value:string)=>decryptVaultValue(value,env.JWT_SECRET)
