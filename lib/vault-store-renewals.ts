import 'server-only'
import {createHash} from 'node:crypto'
import {prisma} from '@/lib/prisma'
import {getAndroidSubscriptionPurchase} from '@/lib/google-play'
import {verifyAppleVaultSubscription} from '@/lib/apple-vault-subscriptions'
export {encryptVaultSecret as encryptStoreReference} from '@/lib/vault-secrets'
import {decryptVaultSecret} from '@/lib/vault-secrets'
/** Refresh expired or stale store subscriptions; an outage never changes stored entitlements. */
export async function refreshVaultSubscriptions(userId:string) {
 const cutoff=new Date(Date.now()-5*60*1000)
 const records=await prisma.vaultStorageEntitlement.findMany({where:{userId,provider:{in:['APPLE','GOOGLE_PLAY']},providerData:{not:null},OR:[{lastVerifiedAt:null},{lastVerifiedAt:{lt:cutoff}}]}})
 for(const record of records) {
  try {
   const [plan,reference]=await Promise.all([prisma.vaultStoragePlan.findUnique({where:{id:record.planId}}),decryptVaultSecret(record.providerData!)])
   if(!plan) continue
   let expiry:Date
   if(record.provider==='APPLE') {
    if(!plan.appleProductId) continue
    expiry=(await verifyAppleVaultSubscription(reference,plan.appleProductId,userId)).expiresAt
   } else {
    if(!plan.googleProductId) continue
    const purchase=await getAndroidSubscriptionPurchase(plan.googleProductId,reference)
    if(purchase.obfuscatedExternalAccountId!==createHash('sha256').update(userId).digest('hex') || purchase.paymentState!==1) continue
    expiry=new Date(Number(purchase.expiryTimeMillis))
    if(!Number.isFinite(expiry.getTime())) continue
   }
   await prisma.vaultStorageEntitlement.update({where:{id:record.id},data:{expiresAt:expiry,lastVerifiedAt:new Date()}})
  } catch { /* Existing verified expiry remains authoritative until a successful refresh. */ }
 }
}
