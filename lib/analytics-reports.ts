import 'server-only';
import { prisma } from '@/lib/prisma';
import { accountInsights } from '@/lib/mobile-insights';
import { sendEmail } from '@/lib/email';

export function reportText(data: Awaited<ReturnType<typeof accountInsights>>) {
  return ['ChatAndTip Insights', `${data.period.start} to ${data.period.end} (UTC)`,
    `New followers: ${data.summary.newFollowers}`, `Reached accounts: ${data.summary.reachedAccounts}`,
    `Recorded viewing sessions: ${data.viewing.sessions}`,
    `Watch time (seconds): ${data.viewing.watchSeconds.toFixed(1)}`,
    ...(!data.entity ? [`Earnings (USD): ${data.summary.earned.toFixed(2)}`,`Tips received: ${data.summary.tips}`] : []),
    '', ...data.insights].join('\n');
}

export async function deliverAnalyticsReports(now = new Date()) {
  const due = await prisma.analyticsReportSchedule.findMany({where:{enabled:true,nextRunAt:{lte:now},
    OR:[{leasedUntil:null},{leasedUntil:{lt:now}}]},take:20,orderBy:{nextRunAt:'asc'}});
  let sent = 0;
  for (const schedule of due) {
    const lease = new Date(now.getTime()+15*60000);
    const claim = await prisma.analyticsReportSchedule.updateMany({where:{userId:schedule.userId,enabled:true,
      nextRunAt:{lte:now},OR:[{leasedUntil:null},{leasedUntil:{lt:now}}]},data:{leasedUntil:lease}});
    if (!claim.count) continue;
    try {
      const user=await prisma.user.findFirst({where:{id:schedule.userId,isActive:true,status:{notIn:['BLOCKED','HIDDEN']}},select:{email:true}});
      if(!user?.email) {
        await prisma.analyticsReportSchedule.updateMany({where:{userId:schedule.userId,leasedUntil:lease},data:{enabled:false,leasedUntil:null,lastError:'Account email unavailable'}});
        continue;
      }
      const data=await accountInsights(schedule.userId,schedule.frequency,now);
      // Recheck consent after generating the report, before any external send.
      const consent=await prisma.analyticsReportSchedule.findFirst({where:{userId:schedule.userId,enabled:true,leasedUntil:lease}});
      if(!consent) continue;
      const result=await sendEmail({to:user.email,subject:'Your ChatAndTip insights',text:reportText(data)});
      if(!result.success) throw new Error('Email delivery unavailable');
      await prisma.analyticsReportSchedule.updateMany({where:{userId:schedule.userId,leasedUntil:lease},data:{
        lastSentAt:now,lastError:null,leasedUntil:null,nextRunAt:new Date(now.getTime()+schedule.frequency*86400000)}});
      sent++;
    } catch {
      await prisma.analyticsReportSchedule.updateMany({where:{userId:schedule.userId,leasedUntil:lease},data:{
        lastError:'Delivery failed. Retrying later.',leasedUntil:null,nextRunAt:new Date(now.getTime()+3600000)}});
    }
  }
  return {sent};
}
