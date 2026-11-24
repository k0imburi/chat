import 'server-only'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { REQUIRED_REFERRALS } from '@/lib/vault-storage-policy'

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function generateCode() {
  const bytes = randomBytes(12)
  return Array.from(bytes, b => alphabet[b & 31]).join('')
}

/** Creates one stable, opaque code per account; retries handle rare collisions. */
export async function ensureReferralAccount(userId: string) {
  const existing = await prisma.vaultReferralAccount.findUnique({where:{userId}})
  if (existing) return existing
  for (let attempt = 0; attempt < 5; attempt++) {
    try { return await prisma.vaultReferralAccount.create({data:{userId,code:generateCode()}}) }
    catch (error: any) {
      if (error?.code !== 'P2002') throw error
      const raced = await prisma.vaultReferralAccount.findUnique({where:{userId}})
      if (raced) return raced
    }
  }
  throw new Error('Unable to create a referral code')
}

/** Resolve an optional referral before creating an account. */
export async function findReferralOwner(code: string) {
  const normalized = code.trim().toUpperCase()
  if (!normalized) return null
  const account = await prisma.vaultReferralAccount.findUnique({where:{code:normalized}})
  if (!account) throw new Error('Referral code not found')
  const owner = await prisma.user.findUnique({where:{id:account.userId},select:{isActive:true,status:true}})
  if (!owner?.isActive || ['BLOCKED','HIDDEN'].includes(owner.status)) throw new Error('Referral code not available')
  return account.userId
}

/** Only call at new account creation; a unique constraint prevents rebinding. */
export async function attachNewReferral(referrerUserId: string, referredUserId: string) {
  if (referrerUserId === referredUserId) throw new Error('You cannot refer your own account')
  return prisma.vaultReferral.create({data:{referrerUserId,referredUserId}})
}

/** Mark onboarding complete and award once, serializing awards per referrer. */
export async function completeReferral(referredUserId: string) {
  return prisma.$transaction(async tx => {
    const referral = await tx.vaultReferral.findUnique({where:{referredUserId}})
    if (!referral) return false
    await tx.$queryRaw`SELECT userId FROM VaultReferralAccount WHERE userId=${referral.referrerUserId} FOR UPDATE`
    await tx.vaultReferral.updateMany({where:{id:referral.id,completedAt:null},data:{completedAt:new Date()}})
    const count = await tx.vaultReferral.count({where:{referrerUserId:referral.referrerUserId,completedAt:{not:null}}})
    if (count >= REQUIRED_REFERRALS) {
      const awarded = await tx.vaultReferralAccount.updateMany({where:{userId:referral.referrerUserId,bonusAwardedAt:null},data:{bonusAwardedAt:new Date()}})
      return awarded.count === 1
    }
    return false
  })
}

export async function referralOverview(userId: string) {
  const account = await ensureReferralAccount(userId)
  const referrals = await prisma.vaultReferral.findMany({where:{referrerUserId:userId,completedAt:{not:null}},select:{referredUserId:true,completedAt:true},orderBy:{completedAt:'asc'}})
  const users = referrals.length ? await prisma.user.findMany({where:{id:{in:referrals.map(r=>r.referredUserId)}},select:{id:true,fullName:true}}) : []
  const names = new Map(users.map(user=>[user.id,user.fullName]))
  return {code:account.code,completedCount:referrals.length,bonusEarned:!!account.bonusAwardedAt,
    showCelebration:!!account.bonusAwardedAt && !account.celebrationSeenAt,
    referredNames:referrals.slice(0,REQUIRED_REFERRALS).map(r=>names.get(r.referredUserId) || 'A new member')}
}
