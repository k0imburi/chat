import 'server-only';
import {prisma} from '@/lib/prisma';
import {countryCode,ratesForCountry} from '@/lib/ad-pricing';
import {serializeMobileUserWithLikes,languageTokens} from '@/lib/mobile-users';

type Entry={user:Record<string,unknown>;video:Record<string,unknown>};

export function isTestAdViewer(ad:{isTest?:boolean;testViewerIds?:unknown},userId:string) {
  if(!ad.isTest) return true;
  return Array.isArray(ad.testViewerIds)&&
    (ad.testViewerIds.includes(userId)||ad.testViewerIds.includes('*'));
}

function isAllUsersTestAd(ad:{isTest?:boolean;testViewerIds?:unknown}) {
  return ad.isTest===true&&Array.isArray(ad.testViewerIds)&&ad.testViewerIds.includes('*');
}

export function orderOrganicByExposure(
  userId:string,
  organic:Entry[],
  counts:Map<string,number>,
) {
  return organic
    .filter(entry=>entry.user.userId!==userId&&!entry.video.adCampaignId)
    .sort((a,b)=>(counts.get(String(a.video.id))??0)-(counts.get(String(b.video.id))??0));
}

function campaignDay(now:Date,offsetMinutes:number) {
  return new Date(now.getTime()+offsetMinutes*60000).toISOString().slice(0,10);
}

function auctionScore(ad:any) {
  const impressions=Math.max(1,ad.impressions);
  const responseRate=(ad.clicks+ad.likes+ad.comments+ad.shares)/impressions;
  const quality=1+Math.min(2,responseRate*4);
  // The stored rate already includes the advertiser's bid multiplier.
  return Number(ad.rate)*quality;
}

export function weightedAdOrder<T>(
  ads:T[],
  score:(ad:T)=>number,
  random:()=>number=Math.random,
) {
  const pool=[...ads],ordered:T[]=[];
  while(pool.length) {
    const weights=pool.map(ad=>Math.max(0.000001,score(ad)));
    const total=weights.reduce((sum,value)=>sum+value,0);
    let cursor=random()*total,index=0;
    for(;index<weights.length-1;index++) {
      cursor-=weights[index];
      if(cursor<0) break;
    }
    ordered.push(pool.splice(index,1)[0]);
  }
  return ordered;
}

function ageOn(date:Date, birthday:Date|null) {
  if(!birthday) return null;
  let age=date.getUTCFullYear()-birthday.getUTCFullYear();
  const beforeBirthday=date.getUTCMonth()<birthday.getUTCMonth()||
    (date.getUTCMonth()===birthday.getUTCMonth()&&date.getUTCDate()<birthday.getUTCDate());
  if(beforeBirthday) age--;
  return age;
}

function distanceKm(aLat:number,aLng:number,bLat:number,bLng:number) {
  const radians=(value:number)=>value*Math.PI/180;
  const dLat=radians(bLat-aLat),dLng=radians(bLng-aLng);
  const value=Math.sin(dLat/2)**2+Math.cos(radians(aLat))*Math.cos(radians(bLat))*Math.sin(dLng/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(value),Math.sqrt(1-value));
}

function matchesDetailedAudience(ad:any,viewer:any,now:Date) {
  const creative=(ad.creative??{}) as Record<string,unknown>;
  const isEntity=viewer.accountType==='ENTITY';
  if(!isEntity) {
    const age=ageOn(now,viewer.birthday);
    if(age!==null&&(age<Number(creative.minimumAge??18)||age>Number(creative.maximumAge??65))) return false;
    const gender=String(creative.gender??'All');
    if(gender==='Women'&&String(viewer.gender).toUpperCase()!=='F') return false;
    if(gender==='Men'&&String(viewer.gender).toUpperCase()!=='M') return false;
  }
  if(creative.locationMode==='local') {
    const viewerPoint=[viewer.latitude,viewer.longitude].map(Number);
    if(viewerPoint.some(value=>!Number.isFinite(value))) return false;
    const configured=Array.isArray(creative.targetLocations)
      ? creative.targetLocations as Array<{latitude?:unknown;longitude?:unknown}>
      : [];
    const targets=configured.length?configured.map(target=>[Number(target.latitude),Number(target.longitude)]):[
      [Number(creative.targetLatitude??ad.owner.latitude),Number(creative.targetLongitude??ad.owner.longitude)],
    ];
    const radius=Number(creative.radiusKm??5);
    if(!targets.some(([lat,lng])=>Number.isFinite(lat)&&Number.isFinite(lng)&&distanceKm(viewerPoint[0],viewerPoint[1],lat,lng)<=radius)) return false;
  }
  return true;
}

async function reservePacedDelivery(tx:any,campaignId:string,country:string,now:Date) {
  await tx.$queryRaw`SELECT id FROM AdCampaign WHERE id=${campaignId} FOR UPDATE`;
  const ad=await tx.adCampaign.findUniqueOrThrow({where:{id:campaignId}});
  if(ad.status!=='ACTIVE'||ad.reviewStatus!=='APPROVED'||(!ad.checkoutPaid&&!ad.isTest)) return null;
  const remaining=ad.fundedMicros-ad.spentMicros;
  if(remaining<=0n) {
    await tx.adCampaign.update({where:{id:campaignId},data:{status:'PAUSED'}});
    return null;
  }
  const dailyBudget=ad.dailyBudgetMicros>0n?ad.dailyBudgetMicros:ad.budgetMicros;
  // Feed construction is not an impression. Keep enough capacity available
  // for repeated feed requests and charge pacing only when the client reports
  // a real impression; otherwise reopening the app can exhaust delivery before
  // the viewer ever reaches an ad.
  const capacity=dailyBudget>0n?dailyBudget:1n;
  const day=campaignDay(now,ad.timezoneOffsetMinutes);
  let spent=ad.pacingSpentMicros;
  let tokens=ad.pacingTokensMicros;
  if(ad.pacingDay!==day) {
    spent=0n;tokens=capacity;
  } else if(ad.pacingUpdatedAt) {
    const elapsed=BigInt(Math.max(0,now.getTime()-ad.pacingUpdatedAt.getTime()));
    const refill=dailyBudget*elapsed/86400000n;
    tokens=tokens+refill>capacity?capacity:tokens+refill;
  }
  const dailyRemaining=dailyBudget>spent?dailyBudget-spent:0n;
  if(tokens>dailyRemaining) tokens=dailyRemaining;
  if(tokens>remaining) tokens=remaining;
  const multiplier=Number(ad.bidMultiplier??1);
  const reserve=BigInt(Math.max(1,Math.round(ratesForCountry(country).CPM/1000*multiplier*1e6)));
  if(tokens<reserve||dailyRemaining<reserve) {
    await tx.adCampaign.update({where:{id:campaignId},data:{pacingTokensMicros:tokens,
      pacingSpentMicros:spent,pacingUpdatedAt:now,pacingDay:day,pacedSkips:{increment:1}}});
    return null;
  }
  await tx.adCampaign.update({where:{id:campaignId},data:{pacingTokensMicros:tokens-reserve,
    pacingSpentMicros:spent+reserve,pacingUpdatedAt:now,pacingDay:day,lastDeliveredAt:now}});
  return {reserve,score:auctionScore(ad)};
}

export async function promotionFeed(userId:string,organic:Entry[],random:()=>number=Math.random) {
  const now=new Date(),day=now.toISOString().slice(0,10);
  return prisma.$transaction(async tx=>{
    // Serialize daily caps and the last-ad marker across concurrent feed requests.
    await tx.$queryRaw`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;
    const viewer=await tx.user.findUniqueOrThrow({where:{id:userId},include:{blockedUsers:true,blockedByUsers:true}});
    const blocked=[...viewer.blockedUsers.map(b=>b.blockedId),...viewer.blockedByUsers.map(b=>b.blockerId)];
    const state=await tx.adFeedDay.upsert({where:{id:`${userId}:${day}`},create:{id:`${userId}:${day}`},update:{}});
    const organicMediaIds=organic.map(entry=>String(entry.video.id??'')).filter(Boolean);
    const exposures=organicMediaIds.length
      ? await tx.feedExposure.groupBy({by:['mediaId'],where:{userId,day,mediaId:{in:organicMediaIds}},_count:true})
      : [];
    const counts=new Map(exposures.map(e=>[e.mediaId,e._count]));
    // Exposure frequency should influence ordering, never exhaust the organic
    // feed. Repeated refreshes previously removed every post after its third
    // impression and left users on an empty Discover screen for the day.
    const available=orderOrganicByExposure(userId,organic,counts);
    if(available.length) {
      await tx.feedExposure.createMany({data:available.map(entry=>({userId,mediaId:String(entry.video.id),day}))});
    }
    const ads=await tx.adCampaign.findMany({where:{status:'ACTIVE',reviewStatus:'APPROVED',
      OR:[{isTest:false,checkoutPaid:true},{isTest:true,testViewerIds:{array_contains:[userId]}},{isTest:true,testViewerIds:{array_contains:['*']}}],ownerId:{notIn:blocked},
      startDate:{lte:now},endDate:{gt:now},media:{isHiddenByOwner:false,reportStatus:null,copyrightStatus:null},
      owner:{isActive:true,status:{notIn:['BLOCKED','HIDDEN']}}},include:{owner:{include:{media:true}},media:true},orderBy:{createdAt:'asc'},take:200});
    const country=countryCode(viewer.country??'');
    const interests=(Array.isArray(viewer.interests)?viewer.interests:[]).map(s=>String(s).toLowerCase());
    const eligible=ads.filter(ad=>{
      if(blocked.includes(ad.ownerId)) return false;
      const globalTest=isAllUsersTestAd(ad);
      if(ad.ownerId===userId&&!globalTest) return false;
      const isEntity=viewer.accountType==='ENTITY';
      const matchesTargeting=(ad.countries as string[]).includes(country)&&
        (isEntity||[...languageTokens(ad.language)].some(l=>languageTokens(viewer.language).has(l)))&&
        (isEntity||(ad.subjects as string[]).some(s=>interests.includes(s.toLowerCase())))&&
        matchesDetailedAudience(ad,viewer,now);
      return isTestAdViewer(ad,userId)&&ad.fundedMicros>ad.spentMicros&&(globalTest||matchesTargeting);
    })
      .sort((a,b)=>auctionScore(b)-auctionScore(a)||a.createdAt.getTime()-b.createdAt.getTime());
    const result:Entry[]=[];
    let last=state.lastAdId, gap=0;
    for(const entry of available) {
      result.push(entry);gap++;
      if(gap<5) continue;
      // A delivery row only means the feed response contained an ad; it does
      // not mean the user reached it. Never frequency-cap from delivery rows.
      // Prefer a different campaign from the previous slot, then perform a
      // weighted draw so higher bids win more often without becoming the only
      // campaign a viewer can receive.
      const availableAds=eligible.filter(a=>a.media);
      const alternatives=availableAds.filter(a=>a.id!==last);
      const candidates=weightedAdOrder(
        alternatives.length?alternatives:availableAds,
        auctionScore,
        random,
      );
      let ad:any=null,pacing:{reserve:bigint;score:number}|null=null;
      for(const candidate of candidates) {
        pacing=await reservePacedDelivery(tx,candidate.id,country,now);
        if(pacing){ad=candidate;break;}
      }
      if(!ad||!pacing) continue;
      const losingIds=candidates.filter(a=>a.id!==ad.id).map(a=>a.id);
      if(losingIds.length) await tx.adCampaign.updateMany({where:{id:{in:losingIds}},data:{auctionLosses:{increment:1}}});
      const delivery=await tx.adDelivery.create({data:{campaignId:ad.id,viewerId:userId,country,day,
        pacingReservedMicros:pacing.reserve,auctionScore:pacing.score}});
      const owner=serializeMobileUserWithLikes(ad.owner,new Set(),new Set(),new Set());
      const {gallery,...profile}=owner;
      const video=(gallery as Array<Record<string,unknown>>).find(m=>m.id===ad.media!.id);
      if(!video) continue;
      result.push({user:profile,video:{...video,adCampaignId:ad.id,adDeliveryId:delivery.id,adWebsite:ad.websiteUrl,adCta:ad.ctaLabel,createdAt:null}});
      last=ad.id;gap=0;
    }
    await tx.adFeedDay.update({where:{id:state.id},data:{lastAdId:last}});
    return result;
  },{timeout:15000});
}

export const adEventKinds=['IMPRESSION','CLICK','LIKE','COMMENT','SHARE'] as const;
export type AdEventKind=typeof adEventKinds[number];
export async function recordAdEvent(userId:string,deliveryId:string,kind:AdEventKind) {
  return prisma.$transaction(async tx=>{
    const delivery=await tx.adDelivery.findFirst({where:{id:deliveryId,viewerId:userId}});
    if(!delivery) throw new Error('Invalid ad delivery');
    await tx.$queryRaw`SELECT id FROM AdCampaign WHERE id=${delivery.campaignId} FOR UPDATE`;
    const ad=await tx.adCampaign.findUniqueOrThrow({where:{id:delivery.campaignId},include:{media:true}});
    if(ad.ownerId===userId&&!isAllUsersTestAd(ad)) throw new Error('Advertisers cannot generate their own charges');
    if(!isTestAdViewer(ad,userId)) throw new Error('Not a campaign tester');
    const previous=await tx.adEvent.findUnique({where:{deliveryId_kind:{deliveryId,kind}}});
    if(previous) return {accepted:true};
    const now=new Date();
    if(ad.status!=='ACTIVE'||ad.reviewStatus!=='APPROVED'||(!ad.checkoutPaid&&!ad.isTest)||!ad.startDate||ad.startDate>now||!ad.endDate||ad.endDate<=now||
      delivery.createdAt.getTime()<now.getTime()-86400000||!ad.media||ad.media.isHiddenByOwner||ad.media.reportStatus||ad.media.copyrightStatus)
      return {accepted:false};
    if(kind!=='IMPRESSION' && !await tx.adEvent.findUnique({where:{deliveryId_kind:{deliveryId,kind:'IMPRESSION'}}})) return {accepted:false};
    if(kind==='LIKE'&&!await tx.videoLike.findFirst({where:{senderId:userId,mediaId:ad.media.id}})) return {accepted:false};
    if(kind==='COMMENT'&&!await tx.videoComment.findFirst({where:{authorId:userId,mediaId:ad.media.id,createdAt:{gte:delivery.createdAt}}})) return {accepted:false};
    if(kind==='SHARE'&&!await tx.mediaRepost.findFirst({where:{userId,mediaId:ad.media.id,createdAt:{gte:delivery.createdAt}}})) return {accepted:false};
    const rates=ratesForCountry(delivery.country);
    const multiplier=Number(ad.bidMultiplier??1);
    const billable=ad.metric==='CPM'?kind==='IMPRESSION':ad.metric==='CPC'?kind==='CLICK':['LIKE','COMMENT','SHARE'].includes(kind);
    const cost=billable?BigInt(Math.round((kind==='IMPRESSION'?rates.CPM/1000:kind==='CLICK'?rates.CPC:rates.CPE)*multiplier*1e6)):0n;
    if(ad.spentMicros+cost>ad.fundedMicros) {
      await tx.adCampaign.update({where:{id:ad.id},data:{status:'PAUSED'}});
      return {accepted:false};
    }
    // Test spending exercises budget limits but never records a real charge.
    await tx.adEvent.create({data:{deliveryId,kind,chargeMicros:ad.isTest?0n:cost}});
    const field={IMPRESSION:'impressions',CLICK:'clicks',LIKE:'likes',COMMENT:'comments',SHARE:'shares'}[kind];
    await tx.adCampaign.update({where:{id:ad.id},data:{[field]:{increment:1},
      ...(cost>0n?{spentMicros:{increment:cost}}:{}),
      ...(cost>0n&&ad.spentMicros+cost===ad.fundedMicros?{status:'PAUSED' as const}:{})}});
    return {accepted:true};
  });
}
