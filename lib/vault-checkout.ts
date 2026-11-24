import 'server-only'
import {Prisma} from '@prisma/client'
import {env} from '@/lib/env'
import {prisma} from '@/lib/prisma'
import {vaultPlanExpiry} from '@/lib/vault-billing-policy'
import {initializePaystackTransaction,resolvePaystackConfig} from '@/lib/paystack'

/** Create a payment intent; entitlement is granted only by the verified webhook. */
export async function createVaultCheckout(userId:string,planId:string) {
  if (!(await resolvePaystackConfig()).enabled) throw new Error('Web checkout is not available')
  const [plan,user,settings]=await Promise.all([
    prisma.vaultStoragePlan.findUnique({where:{id:planId}}),
    prisma.user.findUnique({where:{id:userId},select:{email:true}}),
    prisma.appSettings.findUnique({where:{id:1},select:{usdToKesRate:true}}),
  ])
  if (!plan?.active || !plan.priceCents || !user) throw new Error('This plan is not available')
  const rate=Number(settings?.usdToKesRate)
  if (!['USD','KES'].includes(plan.currency) || (plan.currency==='USD' && !(rate>0))) throw new Error('Currency conversion is not configured')
  const amountKes=plan.currency==='KES'?plan.priceCents/100:Math.round(plan.priceCents*rate)/100
  if (!Number.isFinite(amountKes) || amountKes<=0) throw new Error('Invalid plan price')
  const purchase=await prisma.creditPurchase.create({data:{userId,phone:'',items:{} as Prisma.InputJsonValue,totalKes:new Prisma.Decimal(amountKes),provider:'PAYSTACK',status:'PENDING',pricingSnapshot:{kind:'VAULT_PLAN',planId:plan.id,interval:plan.interval,capacityBytes:plan.capacityBytes.toString(),priceCents:plan.priceCents,currency:plan.currency} as Prisma.InputJsonValue}})
  try {
    const base=(env.APP_URL||'').replace(/\/$/,'')
    if(!base) throw new Error('Checkout is not configured')
    const {authorizationUrl}=await initializePaystackTransaction({reference:purchase.id,amountKes,email:user.email?.includes('@')?user.email:`user-${userId}@chatandtip.app`,callbackUrl:`${base}/checkout?vaultPlan=return&purchaseId=${purchase.id}`})
    return {url:authorizationUrl,purchaseId:purchase.id}
  } catch(error) {await prisma.creditPurchase.update({where:{id:purchase.id},data:{status:'FAILED'}});throw error}
}

/** Invoked only after the webhook verifies its signature, currency and amount. */
export async function fulfillVaultCheckout(purchaseId:string) {
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT p.id FROM CreditPurchase p JOIN users u ON u.id=p.userId WHERE p.id=${purchaseId} FOR UPDATE`
    const purchase=await tx.creditPurchase.findUnique({where:{id:purchaseId}})
    if (!purchase || purchase.provider!=='PAYSTACK' || purchase.allocated) return
    const snapshot=purchase.pricingSnapshot as {kind?:string;planId?:string;interval?:string;capacityBytes?:string}|null
    if (snapshot?.kind!=='VAULT_PLAN' || !snapshot.planId || !snapshot.capacityBytes || !['MONTHLY','YEARLY'].includes(snapshot.interval||'')) throw new Error('Invalid vault purchase')
    const currentPlan=await tx.vaultStoragePlan.findUnique({where:{id:snapshot.planId}})
    if(!currentPlan || !/^\d+$/.test(snapshot.capacityBytes) || BigInt(snapshot.capacityBytes)<=0n || BigInt(snapshot.capacityBytes)>BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Invalid vault purchase capacity')
    const now=new Date()
    const prior=await tx.vaultStorageEntitlement.findFirst({where:{userId:purchase.userId,planId:snapshot.planId,capacityBytes:BigInt(snapshot.capacityBytes),provider:'PAYSTACK',status:'ACTIVE',expiresAt:{gt:now}},orderBy:{expiresAt:'desc'}})
    const starts=prior?.expiresAt ?? now, expires=vaultPlanExpiry(starts,snapshot.interval as 'MONTHLY'|'YEARLY')
    await tx.vaultStorageEntitlement.create({data:{userId:purchase.userId,planId:snapshot.planId,capacityBytes:BigInt(snapshot.capacityBytes),provider:'PAYSTACK',providerReference:purchase.id,status:'ACTIVE',startsAt:starts,expiresAt:expires}})
    await tx.creditPurchase.update({where:{id:purchase.id},data:{status:'SUCCESS',allocated:true}})
  })
}
