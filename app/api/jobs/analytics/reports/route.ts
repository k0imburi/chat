import { NextResponse } from 'next/server';
import { deliverAnalyticsReports } from '@/lib/analytics-reports';

export async function POST(request:Request) {
  const secret=process.env.CRON_SECRET;
  if(!secret || request.headers.get('authorization')!==`Bearer ${secret}`)
    return NextResponse.json({success:false},{status:401});
  return NextResponse.json({success:true,data:await deliverAnalyticsReports()});
}
