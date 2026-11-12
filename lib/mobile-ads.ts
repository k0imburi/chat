import 'server-only';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {prisma} from '@/lib/prisma';
import {adQuote,countryCode,needsAdPolicyReview,validAdWebsite} from '@/lib/ad-pricing';
import {createUserNotification} from '@/lib/mobile-notifications';
import {logError} from '@/lib/log-error';
import {adCtaLabels,normalizeAdCtaLabel} from '@/lib/ad-cta';
import {startAdSchedule} from '@/lib/ad-schedule';

export const adInput=z.object({
  name:z.string().trim().min(1).max(191),caption:z.string().trim().max(5000).default(''),
  description:z.string().trim().max(1000).default(''),
  taggedUserIds:z.array(z.string()).max(5).default([]),
  mediaUrls:z.array(z.string().url()).max(10).default([]),sourceMediaId:z.string().optional(),
  websiteUrl:z.string().default('').refine(validAdWebsite,'Use an HTTPS website, not a social-media link.'),
  ctaLabel:z.preprocess(normalizeAdCtaLabel,z.enum(adCtaLabels)).default('Learn More'),
  ctaColor:z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#C21E55'),
  destination:z.enum(['profile','website','message']).default('website'),
  containsAi:z.boolean().default(false),
  audienceMode:z.enum(['suggested','custom']).default('suggested'),
  locationMode:z.enum(['regional','local']).default('regional'),
  minimumAge:z.number().int().min(18).max(65).default(18),
  maximumAge:z.number().int().min(18).max(65).default(65),
  gender:z.enum(['All','Women','Men']).default('All'),
  radiusKm:z.number().min(1).max(80).optional(),
  targetLatitude:z.number().min(-90).max(90).optional(),
  targetLongitude:z.number().min(-180).max(180).optional(),
  targetLocations:z.array(z.object({
    name:z.string().trim().min(1).max(240),
    latitude:z.number().min(-90).max(90),
    longitude:z.number().min(-180).max(180),
    countryCode:z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  })).max(25).default([]),
  language:z.string().trim().min(2).max(64).default('en'),
  countries:z.array(z.string().transform(countryCode).refine(c=>/^[A-Z]{2}$/.test(c),'Choose a country')).min(1).max(300),
  subjects:z.array(z.string().trim().min(1).max(80)).min(1).max(100),
  startDate:z.coerce.date(),durationDays:z.number().int().min(1).max(365),
  metric:z.enum(['CPM','CPC','CPE']),goal:z.number().int().min(1).max(1000000),
  dailyBudgetUsd:z.number().min(2.5).max(499.9).optional(),
  bidMultiplier:z.number().min(1).max(3).default(1),
  timezoneOffsetMinutes:z.number().int().min(-840).max(840).default(0),
});
export function serializeAd(ad:any) {
  const spend=Number(ad.spentMicros)/1e6;
  const remaining=Math.max(0,Number(ad.fundedMicros-ad.spentMicros)/1e6);
  const deliveryState=ad.reviewStatus==='PENDING'?'In review':ad.reviewStatus==='REJECTED'?'Not approved':
    remaining<=0?'Budget depleted':ad.status==='PAUSED'?'Paused':ad.status!=='ACTIVE'?ad.status:
    ad.pacedSkips>0&&(!ad.lastDeliveredAt||Date.now()-new Date(ad.lastDeliveredAt).getTime()<3600000)?'Paced':
    ad.auctionLosses>Math.max(10,ad.impressions*5)?'Underdelivering':'Running';
  return {...ad,budgetMicros:undefined,fundedMicros:undefined,spentMicros:undefined,
    dailyBudgetMicros:undefined,pacingTokensMicros:undefined,pacingSpentMicros:undefined,
    rate:Number(ad.rate),budget:Number(ad.budgetMicros)/1e6,funded:Number(ad.fundedMicros)/1e6,
    spend,remaining,deliveryState,bidMultiplier:Number(ad.bidMultiplier??1),
    engagements:ad.likes+ad.comments+ad.shares,
    actualCpc:ad.clicks?spend/ad.clicks:0,actualCpm:ad.impressions?spend/ad.impressions*1000:0,
    actualCpe:ad.likes+ad.comments+ad.shares?spend/(ad.likes+ad.comments+ad.shares):0};
}
export async function createAd(ownerId:string,input:z.infer<typeof adInput>) {
  if(input.metric==='CPC'&&!input.websiteUrl) throw new Error('Add a website for a website-click goal.');
  const owner=await prisma.user.findUniqueOrThrow({where:{id:ownerId}});
  const minimum=owner.accountType==='ENTITY'?3:1;
  if(input.durationDays<minimum) throw new Error(`Choose at least ${minimum} days.`);
  if(input.startDate.getTime()<Date.now()-86400000) throw new Error('Choose today or a future start date.');
  let urls=input.mediaUrls;
  let kind='IMAGE';
  let thumbnail='';
  if(input.sourceMediaId) {
    const media=await prisma.userMedia.findFirst({where:{id:input.sourceMediaId,userId:ownerId,adCampaignId:null,
      kind:{in:['IMAGE','GALLERY_VIDEO']},isHiddenByOwner:false,reportStatus:null,copyrightStatus:null}});
    if(!media) throw new Error('Choose one of your available posts.');
    urls=media.kind==='IMAGE'&&Array.isArray(media.images)&&media.images.length?media.images as string[]:[media.url];
    kind=media.kind;thumbnail=media.thumbnailUrl??'';
  } else {
    if(!urls.length) throw new Error('Add a photo or video.');
    const assets=await prisma.asset.findMany({where:{url:{in:urls},visibility:'public',objectKey:{startsWith:`uploads/${ownerId}/`},metadata:{path:'$.userId',equals:ownerId}}});
    if(new Set(assets.map(a=>a.url)).size!==new Set(urls).size) throw new Error('Upload your own creative media.');
    const videos=assets.filter(a=>a.contentType?.startsWith('video/'));
    if(videos.length && (videos.length!==1||urls.length!==1)) throw new Error('Choose one video or multiple photos.');
    if(assets.some(a=>!a.contentType?.match(/^(image|video)\//))) throw new Error('Unsupported creative format.');
    kind=videos.length?'GALLERY_VIDEO':'IMAGE';
    thumbnail=kind==='IMAGE'?urls[0]:'';
  }
  const quote=adQuote(input.countries,input.metric,input.goal,input.bidMultiplier,input.dailyBudgetUsd,input.durationDays);
  if(input.dailyBudgetUsd!==undefined&&input.metric!=='CPM') throw new Error('Daily budget ranges are available for impression campaigns.');
  const minimumDailyBudget=quote.budgetRange.min;
  const maximumDailyBudget=quote.budgetRange.max;
  if(input.dailyBudgetUsd!==undefined&&(input.dailyBudgetUsd<minimumDailyBudget||input.dailyBudgetUsd>maximumDailyBudget)) {
    throw new Error(`Choose a daily budget from USD ${minimumDailyBudget.toFixed(2)} to USD ${maximumDailyBudget.toFixed(2)} for these countries.`);
  }
  const dailyBudgetCents=quote.dailyBudgetCents??Math.max(100,Math.ceil(quote.budgetCents/input.durationDays));
  const previousCampaigns=await prisma.adCampaign.count({where:{ownerId}});
  const policyFlag=needsAdPolicyReview(input.name,input.caption,input.description,input.websiteUrl);
  const reviewStatus=previousCampaigns===0||policyFlag?'PENDING':'APPROVED';
  const tagged=await prisma.user.findMany({where:{id:{in:input.taggedUserIds},isActive:true,status:{notIn:['BLOCKED','HIDDEN']}},select:{id:true,username:true,fullName:true}});
  return prisma.adCampaign.create({data:{ownerId,name:input.name,caption:input.caption,mediaUrls:urls,
    websiteUrl:input.websiteUrl,ctaLabel:input.ctaLabel,language:input.language,countries:input.countries,
    subjects:input.subjects,startDate:input.startDate,endDate:new Date(input.startDate.getTime()+input.durationDays*86400000),
    isBoost:Boolean(input.sourceMediaId),sourceMediaId:input.sourceMediaId,metric:input.metric,rate:quote.rate,
    budgetMicros:BigInt(quote.budgetCents)*10000n,dailyBudgetMicros:BigInt(dailyBudgetCents)*10000n,
    timezoneOffsetMinutes:input.timezoneOffsetMinutes,bidMultiplier:input.bidMultiplier,reviewStatus,
    reviewReason:policyFlag?'Policy screening requires manual review.':null,
    creative:{kind,thumbnail,description:input.description,taggedUserIds:tagged.map(u=>u.id),taggedUsernames:tagged.map(u=>u.username||u.fullName),
      destination:input.destination,ctaColor:input.ctaColor.toUpperCase(),containsAi:input.containsAi,audienceMode:input.audienceMode,locationMode:input.locationMode,
      minimumAge:input.minimumAge,maximumAge:input.maximumAge,gender:input.gender,radiusKm:input.radiusKm,
      targetLatitude:input.targetLatitude,targetLongitude:input.targetLongitude,targetLocations:input.targetLocations},status:'DRAFT',checkoutPaid:false}});
}
export async function publishAd(ownerId:string,id:string,adminTest=false) {
  const result=await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM AdCampaign WHERE id=${id} FOR UPDATE`;
    const ad=await tx.adCampaign.findFirstOrThrow({where:{id,ownerId}});
    if(ad.isTest&&!adminTest) throw new Error('Test campaigns are managed by an administrator.');
    if((!ad.checkoutPaid&&!(ad.isTest&&adminTest))||ad.fundedMicros<=ad.spentMicros) throw new Error('Complete checkout before publishing.');
    if(ad.publishedAt&&(!ad.endDate||ad.endDate<=new Date())) throw new Error('The campaign has ended. Republish this promotion.');
    if(ad.reviewStatus==='REJECTED') throw new Error('This promotion was not approved. Review the reason and create a new campaign.');
    const creative=ad.creative as {kind:string;thumbnail:string;description:string;ctaColor?:string;taggedUserIds?:string[];taggedUsernames?:string[]};
    const urls=ad.mediaUrls as string[];
    if(!creative||!urls?.length) throw new Error('Recreate this older draft with its creative.');
    const existing=await tx.userMedia.findUnique({where:{adCampaignId:id},select:{id:true}});
    const media=await tx.userMedia.upsert({where:{adCampaignId:id},create:{adCampaignId:id,userId:ownerId,
      kind:creative.kind==='IMAGE'?'IMAGE':'GALLERY_VIDEO',url:urls[0],images:creative.kind==='IMAGE'?urls:Prisma.JsonNull,
      thumbnailUrl:creative.thumbnail,title:ad.name,caption:ad.caption,description:creative.description,
      adWebsite:ad.websiteUrl,adCta:ad.ctaLabel,adCtaColor:creative.ctaColor??'#C21E55',taggedUserIds:creative.taggedUserIds??[],taggedUsernames:creative.taggedUsernames??[],
      tagApprovalStatus:'PENDING',tagApprovalStatuses:Object.fromEntries((creative.taggedUserIds??[]).map(id=>[id,'PENDING']))},update:{}});
    const dailyBudget=ad.dailyBudgetMicros>0n?ad.dailyBudgetMicros:ad.budgetMicros;
    const pacingCapacity=dailyBudget>0n?(dailyBudget/12n>0n?dailyBudget/12n:1n):0n;
    const nextStatus=ad.reviewStatus==='PENDING'?'PENDING_REVIEW':'ACTIVE';
    return {ad:await tx.adCampaign.update({where:{id},data:{status:nextStatus,
      ...(nextStatus==='ACTIVE'?startAdSchedule(ad):{}),
      pacingTokensMicros:pacingCapacity,pacingSpentMicros:0n,pacingUpdatedAt:new Date(),
      pacingDay:null}}),media,newPost:!existing,tagIds:creative.taggedUserIds??[]};
  });
  if(result.newPost&&!result.ad.isTest) for(const taggedId of result.tagIds) {
    try {await createUserNotification({userId:taggedId,senderId:ownerId,type:'post_tag',title:'Post tag request',message:'You were invited to be tagged in a promoted post.',metadata:{mediaId:result.media.id,thumbnailUrl:result.media.thumbnailUrl||result.media.url}});}
    catch(error){logError('ad tag notification',error);}
  }
  return result.ad;
}
