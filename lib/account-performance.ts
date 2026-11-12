import 'server-only';
import {prisma} from '@/lib/prisma';

export async function accountPerformance(userId:string,start:Date,end:Date) {
  const user=await prisma.user.findUniqueOrThrow({where:{id:userId},select:{accountType:true,entityPlanType:true,entityPlanExpiresAt:true}});
  const today=new Date(end);today.setUTCHours(0,0,0,0);
  const [events,calls,approved,declined,expired,dailyDm,dailyCallbacks,dm,comments]=await Promise.all([
    prisma.$queryRaw<Array<{day:string;kind:string;total:bigint}>>`SELECT DATE_FORMAT(createdAt,'%Y-%m-%d') AS day,kind,COUNT(*) AS total
      FROM AccountAnalyticsEvent WHERE ownerId=${userId} AND createdAt>=${start} AND createdAt<${end} GROUP BY day,kind ORDER BY day`,
    prisma.callBooking.groupBy({by:['type'],where:{creatorId:userId,createdAt:{gte:start,lt:end}},_count:true}),
    prisma.callBooking.count({where:{creatorId:userId,createdAt:{gte:start,lt:end},approvedAt:{not:null}}}),
    prisma.callBooking.count({where:{creatorId:userId,createdAt:{gte:start,lt:end},declinedAt:{not:null}}}),
    prisma.callBooking.count({where:{creatorId:userId,createdAt:{gte:start,lt:end},status:'EXPIRED'}}),
    prisma.chatMessage.count({where:{senderId:userId,type:{not:'TIP'},sentAt:{gte:today,lt:end}}}),
    prisma.callBooking.count({where:{creatorId:userId,approvedAt:{gte:today,lt:end}}}),
    prisma.$queryRaw<Array<{received:bigint;replied:unknown;averageSeconds:unknown}>>`
      SELECT COUNT(*) AS received,SUM(replyAt IS NOT NULL) AS replied,AVG(TIMESTAMPDIFF(SECOND,sentAt,replyAt)) AS averageSeconds FROM (
        SELECT m.sentAt,(SELECT MIN(r.sentAt) FROM ChatMessage r WHERE r.threadId=m.threadId AND r.senderId=${userId}
          AND r.type NOT IN ('SYSTEM','TIP') AND r.sentAt>m.sentAt AND r.sentAt<${end}) AS replyAt
        FROM ChatMessage m JOIN ChatThread t ON t.id=m.threadId JOIN ChatParticipant p ON p.threadId=t.id
        WHERE p.userId=${userId} AND m.senderId<>${userId} AND t.kind='DIRECT' AND t.broadcastOnly=false
          AND m.type NOT IN ('SYSTEM','TIP') AND m.sentAt>=${start} AND m.sentAt<${end}
      ) AS inbox`,
    prisma.videoComment.findMany({where:{media:{userId},createdAt:{gte:start,lt:end}},orderBy:[{isPinned:'desc'},{createdAt:'desc'}],take:20,
      select:{id:true,mediaId:true,text:true,isPinned:true,attachmentUrl:true,attachmentKind:true,createdAt:true}}),
  ]);
  const received=Number(dm[0]?.received??0),replied=Number(dm[0]?.replied??0);
  const totalCalls=calls.reduce((sum,row)=>sum+row._count,0);
  const active=user.entityPlanExpiresAt && user.entityPlanExpiresAt>end;
  const premium=active&&user.entityPlanType==='PREMIUM';
  const business=active&&user.entityPlanType==='BUSINESS';
  return {events:events.map(row=>({...row,total:Number(row.total)})),comments,
    messaging:{received,replied,unanswered:received-replied,replyRate:received?replied/received*100:null,
      averageResponseSeconds:dm[0]?.averageSeconds==null?null:Number(dm[0].averageSeconds),
      usedToday:dailyDm,dailyLimit:user.accountType==='ENTITY'?(premium?null:business?70:0):null,
      plan:user.accountType==='ENTITY'?(active?user.entityPlanType:'NO_ACTIVE_PLAN'):'CREDITS'},
    calls:{received:totalCalls,approved,declined,expired,approvalRate:totalCalls?approved/totalCalls*100:null,
      voice:calls.find(row=>row.type==='VOICE')?._count??0,video:calls.find(row=>row.type==='VIDEO')?._count??0,
      usedToday:dailyCallbacks,dailyLimit:user.accountType==='ENTITY'?(premium?null:business?20:0):null},
  };
}
