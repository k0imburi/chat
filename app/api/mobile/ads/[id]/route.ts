import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getCustomerOrMobileSession} from '@/lib/customer-mobile-session';
import {prisma} from '@/lib/prisma';
import {publishAd,serializeAd} from '@/lib/mobile-ads';
import {adCheckout} from '@/lib/ad-checkout';
import {env} from '@/lib/env';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const session=await getCustomerOrMobileSession(request);
  if(!session?.userId) return NextResponse.json({success:false},{status:401});
  try {
    const {id}=await params;
    const body=z.object({action:z.enum(['publish','pause','checkout','set_auto_renew','republish']),requestKey:z.string().uuid().optional(),enabled:z.boolean().optional()}).parse(await request.json());
    const campaign=await prisma.adCampaign.findFirstOrThrow({where:{id,ownerId:session.userId}});
    if(campaign.isTest&&body.action!=='pause') throw new Error('Test campaigns are managed by an administrator.');
    if(body.action==='checkout') {
      if(!body.requestKey) throw new Error('Checkout request key required.');
      return NextResponse.json({success:true,data:await adCheckout(session.userId,id,body.requestKey,env.APP_URL?.replace(/\/$/,'')||new URL(request.url).origin)});
    }
    if(body.action==='pause') {
      await prisma.adCampaign.updateMany({where:{id,ownerId:session.userId},data:{status:'PAUSED'}});
      return NextResponse.json({success:true});
    }
    if(body.action==='set_auto_renew') {
      if(body.enabled===undefined) throw new Error('Choose whether auto-renew is on or off.');
      const result=await prisma.adCampaign.updateMany({where:{id,ownerId:session.userId},data:{autoRenew:body.enabled}});
      if(!result.count) throw new Error('Campaign not found.');
      return NextResponse.json({success:true,data:{autoRenew:body.enabled}});
    }
    if(body.action==='republish') {
      const ad=await prisma.adCampaign.findFirstOrThrow({where:{id,ownerId:session.userId}});
      const now=new Date();
      if(ad.reviewStatus==='REJECTED') throw new Error('This promotion was not approved. Review its status before republishing.');
      const depleted=ad.fundedMicros<=ad.spentMicros;
      if(ad.status!=='COMPLETED'&&!depleted&&(!ad.publishedAt||!ad.endDate||ad.endDate>now)) throw new Error('Republish is available after the campaign has finished.');
      const duration=Math.max(1,Math.ceil(((ad.endDate?.getTime()??now.getTime())-(ad.startDate?.getTime()??now.getTime()))/86400000));
      if(ad.fundedMicros<=ad.spentMicros&&!body.requestKey) throw new Error('Republish request key required.');
      const checkout=ad.fundedMicros<=ad.spentMicros
        ? await adCheckout(session.userId,id,body.requestKey!,env.APP_URL?.replace(/\/$/,'')||new URL(request.url).origin)
        : null;
      await prisma.adCampaign.update({where:{id},data:{publishedAt:null,startDate:now,endDate:new Date(now.getTime()+duration*86400000),status:'DRAFT',checkoutPaid:ad.fundedMicros>ad.spentMicros}});
      if(ad.fundedMicros>ad.spentMicros) {
        return NextResponse.json({success:true,data:serializeAd(await publishAd(session.userId,id))});
      }
      return NextResponse.json({success:true,data:checkout});
    }
    return NextResponse.json({success:true,data:serializeAd(await publishAd(session.userId,id))});
  }catch(error){return NextResponse.json({success:false,message:error instanceof Error?error.message:'Unable to update ad.'},{status:400});}
}
