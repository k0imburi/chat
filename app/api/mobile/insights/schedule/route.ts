import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getMobileSessionFromRequest } from '@/lib/mobile-session';
import { getNotificationSettings } from '@/lib/notification-settings';

export async function GET(request:Request) {
  const session=await getMobileSessionFromRequest(request);
  if(!session?.userId) return NextResponse.json({success:false},{status:401});
  const data=await prisma.analyticsReportSchedule.findUnique({where:{userId:session.userId}});
  return NextResponse.json({success:true,data},{headers:{'Cache-Control':'private, no-store'}});
}
export async function PUT(request:Request) {
  const session=await getMobileSessionFromRequest(request);
  if(!session?.userId) return NextResponse.json({success:false},{status:401});
  const parsed=z.object({enabled:z.boolean(),frequency:z.union([z.literal(7),z.literal(30)])}).safeParse(await request.json());
  if(!parsed.success) return NextResponse.json({success:false,message:'Invalid schedule'},{status:400});
  const user=await prisma.user.findUnique({where:{id:session.userId},select:{email:true}});
  if(parsed.data.enabled) {
    const {email}=await getNotificationSettings();
    if(!user?.email || !email.enabled || !email.host || !email.user || !email.password || !email.fromAddress)
      return NextResponse.json({success:false,message:'Email reports are not available for this account yet.'},{status:409});
  }
  const values={...parsed.data,nextRunAt:new Date(Date.now()+parsed.data.frequency*86400000),leasedUntil:null,lastError:null};
  const data=await prisma.analyticsReportSchedule.upsert({where:{userId:session.userId},create:{userId:session.userId,...values},update:values});
  return NextResponse.json({success:true,data},{headers:{'Cache-Control':'private, no-store'}});
}
