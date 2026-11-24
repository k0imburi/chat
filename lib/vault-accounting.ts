import 'server-only'
import { prisma } from '@/lib/prisma'
import {createHash} from 'node:crypto'
import {refreshVaultSubscriptions} from '@/lib/vault-store-renewals'
import { vaultAllowance, vaultUsage } from '@/lib/vault-storage-policy'

async function allowance(tx: any, userId: string, now: Date) {
  const [account, entitlements] = await Promise.all([
    tx.vaultReferralAccount.findUnique({where:{userId},select:{bonusAwardedAt:true}}),
    tx.vaultStorageEntitlement.findMany({where:{userId,status:{in:['ACTIVE','CANCELLED']},expiresAt:{gt:now},startsAt:{lte:now}},orderBy:{expiresAt:'desc'}}),
  ])
  let limit = vaultAllowance(!!account?.bonusAwardedAt, null, now)
  for (const entitlement of entitlements) {
    limit = Math.max(limit, vaultAllowance(!!account?.bonusAwardedAt,{totalBytes:Number(entitlement.capacityBytes),expiresAt:entitlement.expiresAt,status:entitlement.status},now))
  }
  return limit
}

/** Server-side count includes committed objects and unexpired concurrent reservations. */
async function usage(tx:any,userId:string,now:Date) {
  const result = await tx.vaultUploadLedger.aggregate({where:{userId,OR:[{state:'COMMITTED'},{state:'RESERVED',expiresAt:{gt:now}}]},_sum:{sizeBytes:true}})
  return Number(result._sum.sizeBytes ?? 0)
}
export async function vaultQuota(userId:string) {
  await refreshVaultSubscriptions(userId)
  const now=new Date()
  const [limitBytes,usedBytes]=await Promise.all([allowance(prisma,userId,now),usage(prisma,userId,now)])
  return vaultUsage(usedBytes,limitBytes)
}
export async function reserveVaultUpload(userId:string,objectKey:string,sizeBytes:number) {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes<=0) throw new Error('Invalid upload size')
  await refreshVaultSubscriptions(userId)
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM users WHERE id=${userId} FOR UPDATE`
    const now=new Date(), limitBytes=await allowance(tx,userId,now), usedBytes=await usage(tx,userId,now)
    const quota=vaultUsage(usedBytes,limitBytes,sizeBytes)
    if (quota.exceeded) { const error= new Error('Your vault storage is full. Free space or upgrade to upload more.') as Error & {status?:number};error.status=413;throw error }
    await tx.vaultUploadLedger.create({data:{userId,objectKey,objectKeyHash:createHash('sha256').update(objectKey).digest('hex'),sizeBytes:BigInt(sizeBytes),state:'RESERVED',expiresAt:new Date(now.getTime()+30*60*1000)}})
    return quota
  })
}

/** Confirm only the server-observed byte count for a live reservation. */
export async function commitVaultUpload(userId:string,objectKey:string,sizeBytes:number) {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes<=0) throw new Error('Invalid upload size')
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM users WHERE id=${userId} FOR UPDATE`
    const hash=createHash('sha256').update(objectKey).digest('hex')
    const row=await tx.vaultUploadLedger.findUnique({where:{objectKeyHash:hash}})
    if (!row || row.userId!==userId || row.objectKey!==objectKey) throw new Error('Upload reservation not found')
    if (row.state==='COMMITTED' && Number(row.sizeBytes)===sizeBytes) return
    if (row.state!=='RESERVED' || !row.expiresAt || row.expiresAt<=new Date()) throw new Error('Upload reservation expired')
    const now=new Date(), used=await usage(tx,userId,now), limit=await allowance(tx,userId,now)
    if (vaultUsage(Math.max(0,used-Number(row.sizeBytes)),limit,sizeBytes).exceeded) {
      const error=new Error('Your vault storage is full. Free space or upgrade to upload more.') as Error & {status?:number}; error.status=413; throw error
    }
    await tx.vaultUploadLedger.update({where:{id:row.id},data:{state:'COMMITTED',sizeBytes:BigInt(sizeBytes),expiresAt:null}})
  })
}
export async function releaseVaultReservation(userId:string,objectKey:string) {
  const objectKeyHash=createHash('sha256').update(objectKey).digest('hex')
  await prisma.vaultUploadLedger.deleteMany({where:{userId,objectKeyHash,objectKey,state:'RESERVED'}})
}

/** Account for direct uploads from older clients that used the chat upload path. */
export async function claimLegacyVaultUpload(userId:string,objectKey:string) {
  const objectKeyHash=createHash('sha256').update(objectKey).digest('hex')
  const existing=await prisma.vaultUploadLedger.findUnique({where:{objectKeyHash}})
  if (existing) {
    if (existing.userId!==userId || existing.objectKey!==objectKey || existing.state!=='COMMITTED') throw new Error('Vault upload is not ready')
    return
  }
  const asset=await prisma.asset.findUnique({where:{objectKey},select:{sizeBytes:true,metadata:true,visibility:true}})
  const metadata=asset?.metadata && typeof asset.metadata==='object' && !Array.isArray(asset.metadata) ? asset.metadata as Record<string,unknown> : null
  if (!asset || asset.visibility!=='private' || metadata?.userId!==userId || !asset.sizeBytes || asset.sizeBytes<=0) throw new Error('Vault upload could not be verified')
  try { await reserveVaultUpload(userId,objectKey,asset.sizeBytes) }
  catch(error:any) {
    if (error?.code!=='P2002') throw error
    const raced=await prisma.vaultUploadLedger.findUnique({where:{objectKeyHash}})
    if (!raced || raced.userId!==userId || raced.state!=='COMMITTED') throw error
    return
  }
  try { await commitVaultUpload(userId,objectKey,asset.sizeBytes) }
  catch(error) { await releaseVaultReservation(userId,objectKey); throw error }
}
