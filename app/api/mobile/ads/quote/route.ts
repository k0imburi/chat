import {NextResponse} from 'next/server';
import {adInput} from '@/lib/mobile-ads';
import {adQuote} from '@/lib/ad-pricing';
import {getCustomerOrMobileSession} from '@/lib/customer-mobile-session';
export async function POST(request:Request) {
  if(!(await getCustomerOrMobileSession(request))?.userId) return NextResponse.json({success:false},{status:401});
  const result=adInput.pick({countries:true,metric:true,goal:true,bidMultiplier:true,dailyBudgetUsd:true})
    .extend({durationDays:adInput.shape.durationDays.optional()})
    .safeParse(await request.json().catch(()=>null));
  if(!result.success) return NextResponse.json({success:false,message:'Choose countries and a valid goal.'},{status:400});
  if(result.data.dailyBudgetUsd!==undefined&&result.data.metric!=='CPM') return NextResponse.json({success:false,message:'Daily budget ranges are available for impression campaigns.'},{status:400});
  try {
    const quote=adQuote(result.data.countries,result.data.metric,result.data.goal,result.data.bidMultiplier,result.data.dailyBudgetUsd,result.data.durationDays??1);
    return NextResponse.json({success:true,data:quote});
  } catch(error) {
    return NextResponse.json({success:false,message:error instanceof Error?error.message:'Unable to quote this promotion.'},{status:400});
  }
}
