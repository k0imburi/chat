import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createHmac} from 'node:crypto';
import {getMobileSessionFromRequest} from '@/lib/mobile-session';
import {prisma} from '@/lib/prisma';
import {env} from '@/lib/env';
export async function POST(request:Request) {
  const session=await getMobileSessionFromRequest(request);
  if(!session?.userId)return NextResponse.json({success:false},{status:401});
  const parsed=z.object({profileId:z.string().min(1).max(191)}).safeParse(await request.json());
  if(!parsed.success)return NextResponse.json({success:false},{status:400});
  const id=parsed.data.profileId;
  if(id===session.userId||id.startsWith('anon_'))return NextResponse.json({success:true});
  const user=await prisma.user.findFirst({where:{id,isActive:true,status:{notIn:['BLOCKED','HIDDEN']}},select:{id:true}});
  if(!user)return NextResponse.json({success:false},{status:404});
  const blocked=await prisma.userBlock.count({where:{OR:[{blockerId:id,blockedId:session.userId},{blockerId:session.userId,blockedId:id}]}});
  if(blocked)return NextResponse.json({success:false},{status:404});
  const key=createHmac('sha256',env.JWT_SECRET).update(`${session.userId}:${id}:${Math.floor(Date.now()/60000)}`).digest('hex');
  await prisma.accountAnalyticsEvent.upsert({where:{id:key},create:{id:key,ownerId:id,kind:'PROFILE_VIEW'},update:{}});
  return NextResponse.json({success:true});
}
