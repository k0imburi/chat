import {createHash} from 'node:crypto'
/** A plan lasts a calendar month or year, clamping at the last day of the target month. */
export function vaultPlanExpiry(start:Date,interval:'MONTHLY'|'YEARLY'):Date {
  const date=new Date(start)
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid subscription start date')
  const originalDay=date.getUTCDate()
  date.setUTCDate(1)
  if(interval==='YEARLY') date.setUTCFullYear(date.getUTCFullYear()+1)
  else date.setUTCMonth(date.getUTCMonth()+1)
  const lastDay=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate()
  date.setUTCDate(Math.min(originalDay,lastDay))
  return date
}

/** Stable, non-PII account identifier passed to StoreKit. */
export function appleVaultAccountToken(userId:string) {
  const chars=createHash('sha256').update(userId).digest('hex').slice(0,32).split('')
  chars[12]='4'; chars[16]='8'
  const x=chars.join('')
  return `${x.slice(0,8)}-${x.slice(8,12)}-${x.slice(12,16)}-${x.slice(16,20)}-${x.slice(20,32)}`
}
