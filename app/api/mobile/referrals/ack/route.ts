import {getMobileSessionFromRequest} from '@/lib/mobile-session'
import {prisma} from '@/lib/prisma'
export async function POST(request:Request) {
  const session=await getMobileSessionFromRequest(request)
  if(!session) return Response.json({success:false,message:'Unauthorized'},{status:401})
  await prisma.vaultReferralAccount.updateMany({where:{userId:session.userId,bonusAwardedAt:{not:null},celebrationSeenAt:null},data:{celebrationSeenAt:new Date()}})
  return Response.json({success:true})
}
