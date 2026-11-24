'use server'
import {revalidatePath} from 'next/cache'
import {z} from 'zod'
import {prisma} from '@/lib/prisma'
import {requireSessionUser} from '@/lib/auth'

const schema=z.object({id:z.string().optional(),name:z.string().trim().min(1).max(100),capacityGiB:z.coerce.number().int().min(1).max(10000),interval:z.enum(['MONTHLY','YEARLY']),price:z.coerce.number().nonnegative().max(1000000).optional(),currency:z.string().trim().regex(/^[a-zA-Z]{3}$/),appleProductId:z.string().trim().max(191).optional(),googleProductId:z.string().trim().max(191).optional()})
export async function saveVaultPlan(form:FormData) {
  const session=await requireSessionUser()
  if (!['ADMIN','SUPER_ADMIN'].includes(session.role)) throw new Error('Not authorized')
  const amount=form.get('price')?.toString().trim()
  const data=schema.parse({id:form.get('id')||undefined,name:form.get('name'),capacityGiB:form.get('capacityGiB'),interval:form.get('interval'),price:amount?Number(amount):undefined,currency:form.get('currency'),appleProductId:form.get('appleProductId')||undefined,googleProductId:form.get('googleProductId')||undefined})
  const record={name:data.name,capacityBytes:BigInt(data.capacityGiB)*1024n*1024n*1024n,interval:data.interval,priceCents:data.price===undefined?null:Math.round(data.price*100),currency:data.currency.toUpperCase(),appleProductId:data.appleProductId||null,googleProductId:data.googleProductId||null}
  if (data.id) {
    const [existing, subscriptions] = await Promise.all([
      prisma.vaultStoragePlan.findUnique({where:{id:data.id}}),
      prisma.vaultStorageEntitlement.count({where:{planId:data.id}}),
    ])
    if (subscriptions && existing && (existing.capacityBytes !== record.capacityBytes || existing.interval !== record.interval)) {
      throw new Error('Create a new plan to change capacity or interval for existing subscribers')
    }
  }
  // A plan stays a draft until server-verified billing is available.
  if(data.id) await prisma.vaultStoragePlan.update({where:{id:data.id},data:record})
  else await prisma.vaultStoragePlan.create({data:{...record,active:false}})
  revalidatePath('/vault-storage')
}

/** The private key is accepted only for replacement; it is never sent back to the browser. */
export async function saveVaultStoreConfig(form:FormData) {
  const session=await requireSessionUser()
  if (!['ADMIN','SUPER_ADMIN'].includes(session.role)) throw new Error('Not authorized')
  const issuer=form.get('appleIssuerId')?.toString().trim() || null
  const keyId=form.get('appleKeyId')?.toString().trim() || null
  const pem=form.get('applePrivateKey')?.toString().trim() || ''
  const fingerprints=(form.get('androidFingerprints')?.toString()||'').split(/[\n,]+/).map(value=>value.trim().toUpperCase()).filter(Boolean)
  if (issuer && !/^[0-9a-f-]{36}$/i.test(issuer)) throw new Error('Invalid Apple issuer ID')
  if (keyId && !/^[A-Z0-9]{10}$/i.test(keyId)) throw new Error('Invalid Apple key ID')
  if (fingerprints.some(value=>!/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value))) throw new Error('Invalid Android SHA-256 fingerprint')
  let encrypted:string|undefined
  if (pem) {
    const {importPKCS8}=await import('jose')
    await importPKCS8(pem,'ES256')
    const {encryptVaultSecret}=await import('@/lib/vault-secrets')
    encrypted=await encryptVaultSecret(pem)
  }
  await prisma.vaultStoreConfig.upsert({where:{id:1},create:{id:1,appleIssuerId:issuer,appleKeyId:keyId,applePrivateKeyEncrypted:encrypted,androidAppLinkSha256:fingerprints.join('\n')||null},update:{appleIssuerId:issuer,appleKeyId:keyId,...(encrypted?{applePrivateKeyEncrypted:encrypted}:{}),androidAppLinkSha256:fingerprints.join('\n')||null}})
  revalidatePath('/vault-storage')
}
