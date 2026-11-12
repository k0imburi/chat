import {NextResponse} from 'next/server';
import {z} from 'zod';
import {prisma} from '@/lib/prisma';
import {getCustomerOrMobileSession} from '@/lib/customer-mobile-session';
import {adInput,createAd,serializeAd} from '@/lib/mobile-ads';
import {reconcilePendingPaystackAdFunding} from '@/lib/ad-checkout';
import {logError} from '@/lib/log-error';
import {renewExpiredAds} from '@/lib/ad-lifecycle';
export async function GET(request:Request) {
  const session=await getCustomerOrMobileSession(request);
  if(!session?.userId) return NextResponse.json({success:false},{status:401});
  try {
    await renewExpiredAds(session.userId);
    const [initialAds,settings]=await Promise.all([
      prisma.adCampaign.findMany({where:{ownerId:session.userId},orderBy:{createdAt:'desc'}}),
      prisma.appSettings.findUnique({where:{id:1},select:{usdToKesRate:true}}),
    ]);
    let ads=initialAds;
    const now=new Date();
    const depletedIds=ads.filter(ad=>!ad.isTest&&ad.status==='PAUSED'&&ad.reviewStatus==='APPROVED'&&
      ad.fundedMicros<=ad.spentMicros&&ad.startDate&&ad.startDate<=now&&ad.endDate&&ad.endDate>now).map(ad=>ad.id);
    if(depletedIds.length) {
      await reconcilePendingPaystackAdFunding(depletedIds);
      ads=await prisma.adCampaign.findMany({where:{ownerId:session.userId},orderBy:{createdAt:'desc'}});
    }
    const exchangeRate=Number(settings?.usdToKesRate??0);
    const costs=await prisma.$queryRaw<Array<{campaignId:string;kind:string;total:unknown}>>`
      SELECT d.campaignId,e.kind,SUM(e.chargeMicros) AS total FROM AdEvent e
      JOIN AdDelivery d ON d.id=e.deliveryId JOIN AdCampaign a ON a.id=d.campaignId
      WHERE a.ownerId=${session.userId} GROUP BY d.campaignId,e.kind`;
    return NextResponse.json({success:true,data:ads.map(ad=>{const item=serializeAd(ad);return {...item,
      localCurrency:'KES',exchangeRate,localBudget:exchangeRate>0?item.budget*exchangeRate:null,
      localSpend:exchangeRate>0?item.spend*exchangeRate:null,localRemaining:exchangeRate>0?item.remaining*exchangeRate:null,
      costBreakdown:costs.filter(c=>c.campaignId===ad.id).map(c=>({kind:c.kind,cost:Number(c.total)/1e6,
        localCost:exchangeRate>0?Number(c.total)/1e6*exchangeRate:null}))};})},{headers:{'Cache-Control':'no-store'}});
  }catch(error){logError('ads GET',error);return NextResponse.json({success:false,message:'Unable to load ads.'},{status:500});}
}
export async function POST(request:Request) {
  const session=await getCustomerOrMobileSession(request);
  if(!session?.userId) return NextResponse.json({success:false},{status:401});
  try {
    const ad=await createAd(session.userId,adInput.parse(await request.json()));
    return NextResponse.json({success:true,data:serializeAd(ad)},{status:201});
  }catch(error){return NextResponse.json({success:false,message:error instanceof z.ZodError?error.issues[0].message:error instanceof Error?error.message:'Unable to create ad.'},{status:400});}
}
