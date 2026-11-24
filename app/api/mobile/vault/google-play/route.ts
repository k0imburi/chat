import {createHash} from 'node:crypto'
import {z} from 'zod'
import {getMobileSessionFromRequest} from '@/lib/mobile-session'
import {getAndroidSubscriptionPurchase} from '@/lib/google-play'
import {prisma} from '@/lib/prisma'
import {encryptStoreReference} from '@/lib/vault-store-renewals'

export async function POST(request:Request) {
  const session=await getMobileSessionFromRequest(request)
  if(!session) return Response.json({success:false,message:'Unauthorized'},{status:401})
  try {
    const body=z.object({productId:z.string().min(1).max(191),purchaseToken:z.string().min(1).max(4096)}).parse(await request.json())
    const plan=await prisma.vaultStoragePlan.findFirst({where:{active:true,googleProductId:body.productId}})
    if(!plan) throw new Error('This storage plan is not available')
    const purchase=await getAndroidSubscriptionPurchase(body.productId,body.purchaseToken)
    const accountId=createHash('sha256').update(session.userId).digest('hex')
    if(purchase.obfuscatedExternalAccountId!==accountId) throw new Error('The store purchase does not match this account')
    const expiry=new Date(Number(purchase.expiryTimeMillis))
    if(purchase.paymentState!==1 || !Number.isFinite(expiry.getTime()) || expiry<=new Date()) throw new Error('Subscription payment is not active')
    const reference=`google:${createHash('sha256').update(body.purchaseToken).digest('hex')}`
    const providerData=await encryptStoreReference(body.purchaseToken)
    await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM users WHERE id=${session.userId} FOR UPDATE`
      const existing=await tx.vaultStorageEntitlement.findUnique({where:{providerReference:reference}})
      if(existing && (existing.userId!==session.userId || existing.planId!==plan.id)) throw new Error('This store purchase is already linked to another account')
      if(existing) await tx.vaultStorageEntitlement.update({where:{id:existing.id},data:{expiresAt:expiry,status:'ACTIVE',providerData,lastVerifiedAt:new Date()}})
      else await tx.vaultStorageEntitlement.create({data:{userId:session.userId,planId:plan.id,capacityBytes:plan.capacityBytes,provider:'GOOGLE_PLAY',providerReference:reference,status:'ACTIVE',providerData,lastVerifiedAt:new Date(),startsAt:new Date(),expiresAt:expiry}})
    })
    return Response.json({success:true,data:{expiresAt:expiry.toISOString()}})
  } catch(error) {
    const safe=['This storage plan is not available','The store purchase does not match this account','Subscription payment is not active','This store purchase is already linked to another account']
    const message=error instanceof Error && safe.includes(error.message)?error.message:'Unable to verify subscription. Please try again.'
    return Response.json({success:false,message},{status:400})
  }
}
