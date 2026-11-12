import 'server-only';
import {prisma} from '@/lib/prisma';

const DAY_MS=86400000;

export async function renewExpiredAds(ownerId?:string,now=new Date()) {
  const due=await prisma.adCampaign.findMany({where:{
    ...(ownerId?{ownerId}:{}),
    isTest:false,autoRenew:true,reviewStatus:'APPROVED',
    status:{in:['ACTIVE','COMPLETED']},endDate:{lte:now},
  }});
  let renewed=0;
  for(const ad of due) {
    if(ad.fundedMicros<=ad.spentMicros) continue;
    const duration=Math.max(1,Math.ceil(((ad.endDate?.getTime()??now.getTime())-(ad.startDate?.getTime()??now.getTime()))/DAY_MS));
    const result=await prisma.adCampaign.updateMany({where:{
      id:ad.id,autoRenew:true,reviewStatus:'APPROVED',endDate:{lte:now},
      fundedMicros:{gt:ad.spentMicros},
    },data:{
      startDate:now,endDate:new Date(now.getTime()+duration*DAY_MS),status:'ACTIVE',
      pacingTokensMicros:ad.dailyBudgetMicros/12n,pacingSpentMicros:0n,
      pacingUpdatedAt:now,pacingDay:null,
    }});
    renewed+=result.count;
  }
  return renewed;
}
