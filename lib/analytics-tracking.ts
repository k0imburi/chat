import 'server-only';
import { createHmac } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';

export function boundedWatch(watchMs: number, durationMs: number, elapsedMs: number) {
  return Math.max(0, Math.min(watchMs, durationMs, elapsedMs + 2000, 300000));
}

export async function recordAnalyticsView(userId: string, input: {
  sessionId: string; mediaId: string; watchMs: number; durationMs: number; completed: boolean;
}) {
  const media = await prisma.userMedia.findFirst({where: {id:input.mediaId,
    kind:{in:['IMAGE','GALLERY_VIDEO']}, isHiddenByOwner:false, copyrightStatus:null, reportStatus:null,
    user:{isActive:true, status:{notIn:['BLOCKED','HIDDEN']}}}, select:{userId:true,kind:true}});
  if (!media || media.userId===userId) return;
  const blocked = await prisma.userBlock.count({where:{OR:[
    {blockerId:userId,blockedId:media.userId},{blockerId:media.userId,blockedId:userId}]}});
  if (blocked) return;
  const viewerKey = createHmac('sha256',env.JWT_SECRET).update(`${media.userId}:${userId}`).digest('hex');
  const id = createHmac('sha256',env.JWT_SECRET).update(`${userId}:${input.mediaId}:${input.sessionId}`).digest('hex');
  const viewer = await prisma.user.findUnique({where:{id:userId},select:{country:true}});
  const now = new Date();
  const existing = await prisma.analyticsView.findUnique({where:{id}});
  if (!existing && await prisma.analyticsView.count({where:{viewerKey,createdAt:{gte:new Date(now.getTime()-60000)}}}) >= 60) return;
  // A short registration starts the server clock; repeated cumulative samples
  // update one session instead of creating billable events or double-counting.
  const row = await prisma.analyticsView.upsert({where:{id}, create:{id,mediaId:input.mediaId,viewerKey,country:viewer?.country}, update:{}});
  const duration = media.kind==='IMAGE' ? 0 : Math.min(input.durationMs,300000);
  const watch = boundedWatch(input.watchMs,duration,now.getTime()-row.createdAt.getTime());
  await prisma.analyticsView.updateMany({where:{id,watchMs:{lte:watch}}, data:{
    watchMs:watch,durationMs:duration,
    ...(input.completed && duration>0 && watch>=duration*0.95 ? {completed:true} : {}),
  }});
}
