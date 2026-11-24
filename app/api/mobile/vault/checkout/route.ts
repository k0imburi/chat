import {z} from 'zod'
import {getMobileSessionFromRequest} from '@/lib/mobile-session'
import {createVaultCheckout} from '@/lib/vault-checkout'
export async function POST(request:Request) {
  const session=await getMobileSessionFromRequest(request)
  if(!session) return Response.json({success:false,message:'Unauthorized'},{status:401})
  try {const {planId}=z.object({planId:z.string().min(1).max(191)}).parse(await request.json());return Response.json({success:true,data:await createVaultCheckout(session.userId,planId)})}
  catch(error) {return Response.json({success:false,message:error instanceof Error?error.message:'Unable to start checkout'},{status:400})}
}
