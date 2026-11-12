import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getMobileSessionFromRequest} from '@/lib/mobile-session';
import {getCustomerOrMobileSession} from '@/lib/customer-mobile-session';
import {recordAdEvent,adEventKinds} from '@/lib/ad-delivery';
export async function POST(request:Request) {
  const session=await getCustomerOrMobileSession(request);
  if(!session?.userId) return NextResponse.json({success:false},{status:401});
  const body=z.object({deliveryId:z.string().uuid(),kind:z.enum(adEventKinds)}).safeParse(await request.json().catch(()=>null));
  if(!body.success) return NextResponse.json({success:false},{status:400});
  try{return NextResponse.json({success:true,data:await recordAdEvent(session.userId,body.data.deliveryId,body.data.kind)});}
  catch{return NextResponse.json({success:false,message:'Unable to record ad event.'},{status:400});}
}
