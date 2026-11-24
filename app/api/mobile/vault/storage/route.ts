import {getMobileSessionFromRequest} from '@/lib/mobile-session'
import {vaultQuota} from '@/lib/vault-accounting'
import {prisma} from '@/lib/prisma'
import {logError} from '@/lib/log-error'
export async function GET(request:Request) {
  const session=await getMobileSessionFromRequest(request)
  if(!session) return Response.json({success:false,message:'Unauthorized'},{status:401})
  try {
    const [quota,plans]=await Promise.all([vaultQuota(session.userId),prisma.vaultStoragePlan.findMany({where:{active:true,priceCents:{not:null}},orderBy:[{capacityBytes:'asc'},{interval:'asc'}]})])
    return Response.json({success:true,data:{percentage:quota.percentage,plans:plans.map(plan=>({id:plan.id,name:plan.name,capacityBytes:Number(plan.capacityBytes),interval:plan.interval,priceCents:plan.priceCents,currency:plan.currency,appleProductId:plan.appleProductId,googleProductId:plan.googleProductId}))}},{headers:{'Cache-Control':'no-store'}})
  } catch(error) {logError('vault storage',error);return Response.json({success:false,message:'Unable to load vault storage'},{status:500})}
}
