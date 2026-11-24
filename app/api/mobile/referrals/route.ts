import {getMobileSessionFromRequest} from '@/lib/mobile-session'
import {referralOverview} from '@/lib/vault-referrals'
import {logError} from '@/lib/log-error'
export async function GET(request:Request) {
  const session=await getMobileSessionFromRequest(request)
  if(!session) return Response.json({success:false,message:'Unauthorized'},{status:401})
  try { return Response.json({success:true,data:await referralOverview(session.userId)},{headers:{'Cache-Control':'no-store'}}) }
  catch(error){logError('referral overview',error);return Response.json({success:false,message:'Unable to load referrals'},{status:500})}
}
