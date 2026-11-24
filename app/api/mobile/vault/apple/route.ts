import {createHash} from 'node:crypto'
import {z} from 'zod'
import {getMobileSessionFromRequest} from '@/lib/mobile-session'
import {verifyAppleVaultSubscription} from '@/lib/apple-vault-subscriptions'
import {prisma} from '@/lib/prisma'
import {encryptStoreReference} from '@/lib/vault-store-renewals'
export async function POST(request:Request) {
 const session=await getMobileSessionFromRequest(request)
 if(!session) return Response.json({success:false,message:'Unauthorized'},{status:401})
 try {
  const body=z.object({productId:z.string().min(1).max(191),transactionId:z.string().min(1).max(30)}).parse(await request.json())
  const plan=await prisma.vaultStoragePlan.findFirst({where:{active:true,appleProductId:body.productId}})
  if(!plan) throw new Error('This storage plan is not available')
  const subscription=await verifyAppleVaultSubscription(body.transactionId,body.productId,session.userId)
  const reference=`apple:${createHash('sha256').update(subscription.originalTransactionId).digest('hex')}`
  const providerData=await encryptStoreReference(subscription.originalTransactionId)
  await prisma.$transaction(async tx=>{
   await tx.$queryRaw`SELECT id FROM users WHERE id=${session.userId} FOR UPDATE`
   const existing=await tx.vaultStorageEntitlement.findUnique({where:{providerReference:reference}})
   if(existing && (existing.userId!==session.userId || existing.planId!==plan.id)) throw new Error('This store purchase belongs to another account')
   if(existing) await tx.vaultStorageEntitlement.update({where:{id:existing.id},data:{expiresAt:subscription.expiresAt,status:'ACTIVE',providerData,lastVerifiedAt:new Date()}})
   else await tx.vaultStorageEntitlement.create({data:{userId:session.userId,planId:plan.id,capacityBytes:plan.capacityBytes,provider:'APPLE',providerReference:reference,status:'ACTIVE',providerData,lastVerifiedAt:new Date(),startsAt:new Date(),expiresAt:subscription.expiresAt}})
  })
  return Response.json({success:true,data:{expiresAt:subscription.expiresAt.toISOString()}})
 } catch(error) {return Response.json({success:false,message:error instanceof Error?error.message:'Unable to verify subscription'},{status:400})}
}
