import {MediaKind,PrismaClient} from '@prisma/client';

const prisma=new PrismaClient();
const DAYS=30;

async function main() {
  const now=new Date();
  const endDate=new Date(now.getTime()+DAYS*86400000);
  const sources=await prisma.adCampaign.findMany({where:{isTest:false,reviewStatus:'APPROVED'}});
  const existing=await prisma.adCampaign.findMany({where:{isTest:true,status:'ACTIVE'}});
  let started=0;
  const failed:string[]=[];
  for(const source of sources) {
    try {
      const creative=source.creative as Record<string,unknown>|null;
      const urls=Array.isArray(source.mediaUrls)?source.mediaUrls.map(String):[];
      if(!creative||!urls.length) throw new Error('missing creative media');
      const daily=source.dailyBudgetMicros>0n?source.dailyBudgetMicros:source.budgetMicros;
      if(daily<=0n) throw new Error('missing budget');
      const testBudget=daily*BigInt(DAYS);
      const campaign=await prisma.adCampaign.create({data:{
        ownerId:source.ownerId,name:`[TEST] ${source.name}`.slice(0,191),caption:source.caption,
        mediaUrls:source.mediaUrls??[],websiteUrl:source.websiteUrl,ctaLabel:source.ctaLabel,
        language:source.language,countries:source.countries??[],subjects:source.subjects??[],
        creative:{...creative,taggedUserIds:[],taggedUsernames:[],sourceCampaignId:source.id},
        metric:source.metric,rate:source.rate,bidMultiplier:source.bidMultiplier,
        timezoneOffsetMinutes:source.timezoneOffsetMinutes,isTest:true,testViewerIds:['*'],
        autoRenew:false,checkoutPaid:false,budgetMicros:testBudget,dailyBudgetMicros:daily,
        fundedMicros:testBudget,spentMicros:0n,reviewStatus:'APPROVED',reviewedAt:now,
        status:'ACTIVE',publishedAt:now,startDate:now,endDate,
        pacingTokensMicros:daily/12n>0n?daily/12n:1n,pacingSpentMicros:0n,pacingUpdatedAt:now,
      }});
      const kind=creative.kind==='IMAGE'?MediaKind.IMAGE:MediaKind.GALLERY_VIDEO;
      await prisma.userMedia.create({data:{
        adCampaignId:campaign.id,userId:source.ownerId,kind,url:urls[0],
        images:kind===MediaKind.IMAGE?urls:undefined,
        thumbnailUrl:String(creative.thumbnail??''),title:source.name,caption:source.caption,
        description:String(creative.description??''),containsAi:creative.containsAi===true,
        adWebsite:source.websiteUrl,adCta:source.ctaLabel,taggedUserIds:[],taggedUsernames:[],
        tagApprovalStatuses:{},tagApprovalStatus:'PENDING',
      }});
      const oldIds=existing.filter(item=>{
        const value=item.creative as Record<string,unknown>|null;
        return value?.sourceCampaignId===source.id;
      }).map(item=>item.id);
      if(oldIds.length) await prisma.adCampaign.updateMany({where:{id:{in:oldIds}},data:{status:'COMPLETED',endDate:now,autoRenew:false}});
      started++;
    } catch(error) {
      failed.push(`${source.id}: ${error instanceof Error?error.message:'unknown error'}`);
    }
  }
  console.log(JSON.stringify({approvedSources:sources.length,started,failed,endDate:endDate.toISOString()}));
}

main().finally(()=>prisma.$disconnect());
