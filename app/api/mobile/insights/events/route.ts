import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getMobileSessionFromRequest } from '@/lib/mobile-session';
import { recordAnalyticsView } from '@/lib/analytics-tracking';
import { logError } from '@/lib/log-error';

const schema=z.object({sessionId:z.string().uuid(),mediaId:z.string().min(1).max(191),
  watchMs:z.number().int().min(0).max(300000),durationMs:z.number().int().min(0).max(300000),completed:z.boolean()});
export async function POST(request:Request) {
  const session=await getMobileSessionFromRequest(request);
  if(!session?.userId) return NextResponse.json({success:false},{status:401});
  try {
    await recordAnalyticsView(session.userId,schema.parse(await request.json()));
    return NextResponse.json({success:true});
  } catch(error) {
    if(error instanceof z.ZodError) return NextResponse.json({success:false},{status:400});
    logError('analytics event',error);
    return NextResponse.json({success:false},{status:503});
  }
}
