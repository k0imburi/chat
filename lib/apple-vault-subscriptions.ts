import 'server-only'
import {decodeJwt,importPKCS8,SignJWT} from 'jose'
import {appleVaultAccountToken} from '@/lib/vault-billing-policy'
import {prisma} from '@/lib/prisma'
import {decryptVaultSecret} from '@/lib/vault-secrets'

/** Queries Apple directly; transaction details never come from the client. */
export async function verifyAppleVaultSubscription(transactionId:string,productId:string,userId:string) {
  const config=await prisma.vaultStoreConfig.findUnique({where:{id:1}})
  const issuer=config?.appleIssuerId || process.env.APPLE_IAP_ISSUER_ID, keyId=config?.appleKeyId || process.env.APPLE_IAP_KEY_ID
  const privateKey=config?.applePrivateKeyEncrypted ? await decryptVaultSecret(config.applePrivateKeyEncrypted) : process.env.APPLE_IAP_PRIVATE_KEY?.replace(/\\n/g,'\n')
  const bundleId=process.env.APPLE_IAP_BUNDLE_ID || 'com.chatandtip.app'
  if(!issuer||!keyId||!privateKey) throw new Error('Apple subscriptions are not configured')
  if(!/^\d{1,30}$/.test(transactionId)) throw new Error('Invalid Apple transaction')
  const key=await importPKCS8(privateKey,'ES256')
  const jwt=await new SignJWT({bid:bundleId}).setProtectedHeader({alg:'ES256',kid:keyId,typ:'JWT'}).setIssuer(issuer).setAudience('appstoreconnect-v1').setIssuedAt().setExpirationTime('5m').sign(key)
  const hosts=['https://api.storekit.apple.com',...(process.env.APPLE_IAP_ALLOW_SANDBOX==='true'?['https://api.storekit-sandbox.apple.com']:[])]
  let response:Response|undefined
  for(const host of hosts) {
    response=await fetch(`${host}/inApps/v1/subscriptions/${transactionId}`,{headers:{Authorization:`Bearer ${jwt}`},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)})
    if(response.ok || response.status!==404) break
  }
  if(!response?.ok) throw new Error('Apple could not verify this subscription')
  const body=await response.json() as {bundleId?:string;data?:Array<{lastTransactions?:Array<{status?:number;signedTransactionInfo?:string}>}>}
  if(body.bundleId!==bundleId) throw new Error('Apple subscription belongs to another app')
  const expected=appleVaultAccountToken(userId)
  for(const group of body.data??[]) for(const item of group.lastTransactions??[]) {
    if(![1,4].includes(item.status??0)||!item.signedTransactionInfo) continue
    // This payload was obtained directly over authenticated TLS from Apple's fixed API host.
    const transaction=decodeJwt(item.signedTransactionInfo) as {bundleId?:string;productId?:string;appAccountToken?:string;originalTransactionId?:string;expiresDate?:number;revocationDate?:number}
    if(transaction.bundleId!==bundleId||transaction.productId!==productId||transaction.appAccountToken?.toLowerCase()!==expected||transaction.revocationDate||!transaction.originalTransactionId) continue
    const expiresAt=new Date(Number(transaction.expiresDate))
    if(Number.isFinite(expiresAt.getTime()) && expiresAt>new Date()) return {expiresAt,originalTransactionId:transaction.originalTransactionId}
  }
  throw new Error('No active Apple subscription matches this account')
}
