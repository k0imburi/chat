import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {adQuote,needsAdPolicyReview,ratesForCountry,validAdWebsite} from '../lib/ad-pricing';
async function load(entry:string,db:any){
  const result=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'test',setup(b){
    b.onResolve({filter:/^(server-only|@\/lib\/)/},({path})=>path.endsWith('ad-pricing')?{path:`${process.cwd()}/lib/ad-pricing.ts`}:{path,namespace:'test'});
    b.onLoad({filter:/.*/,namespace:'test'},({path})=>({contents:path.endsWith('prisma')?'export const prisma=__db;':path.endsWith('mobile-users')?
      'export const languageTokens=s=>new Set([s]);export const serializeMobileUserWithLikes=u=>({userId:u.id,gallery:[]});export const serializeVideo=m=>({...m});':path.endsWith('stripe')?'export const resolveStripeConfig=()=>({enabled:false});':path.endsWith('paystack')?
      'export const resolvePaystackConfig=async()=>({enabled:true,secretKey:"test"});export const initializePaystackTransaction=async()=>({authorizationUrl:""});':''}));
  }}]});
  const module={exports:{} as any};new Function('require','module','exports','__db',result.outputFiles[0].text)(createRequire(`${process.cwd()}/package.json`),module,module.exports,db);return module.exports;
}
test('tier quotes are server-owned and CPM uses thousands',()=>{
  assert.deepEqual(ratesForCountry('Kenya'),{CPM:.51,CPC:.1,CPE:.1});
  assert.equal(ratesForCountry('US').CPE,.6);
  assert.equal(ratesForCountry('PL').CPM,5.6);
  assert.equal(ratesForCountry('DE').CPM,17);
  assert.equal(ratesForCountry('SG').CPM,17);
  assert.throws(()=>ratesForCountry('CN'),/not available/);
  assert.throws(()=>ratesForCountry('RU'),/not available/);
  assert.throws(()=>adQuote(['CN'],'CPM',1000),/not available/);
  assert.equal(adQuote(['KE','US'],'CPM',1000).budgetCents,1700);
  assert.equal(adQuote(['KE'],'CPC',50).budgetCents,500);
  assert.equal(adQuote(['KE'],'CPC',50,1.5).budgetCents,750);
  assert.equal(validAdWebsite('https://www.instagram.com/name'),false);
  assert.equal(validAdWebsite('javascript:alert(1)'),false);
  assert.equal(validAdWebsite('https://example.com'),true);
  assert.equal(needsAdPolicyReview('Weekend casino offer'),true);
  assert.equal(needsAdPolicyReview('Photography workshop'),false);
});
function ledger(){
  const ad:any={id:'ad',ownerId:'owner',status:'ACTIVE',reviewStatus:'APPROVED',metric:'CPM',checkoutPaid:true,fundedMicros:5000n,spentMicros:0n,startDate:new Date(0),endDate:new Date('2099-01-01'),media:{id:'m'}};
  const events=new Map();let tail=Promise.resolve();
  const tx:any={$queryRaw:async()=>[],adDelivery:{findFirst:async({where}:any)=>({id:where.id,campaignId:'ad',viewerId:'viewer',country:'KE',createdAt:new Date()})},
    adCampaign:{findUniqueOrThrow:async()=>ad,update:async({data}:any)=>{if(data.spentMicros)ad.spentMicros+=data.spentMicros.increment;if(data.status)ad.status=data.status;}},
    adEvent:{findUnique:async({where}:any)=>events.get(JSON.stringify(where.deliveryId_kind)),create:async({data}:any)=>{events.set(JSON.stringify({deliveryId:data.deliveryId,kind:data.kind}),data);}},};
  return {ad,events,db:{$transaction:(fn:any)=>{const next=tail.then(()=>fn(tx));tail=next.catch(()=>{});return next;}}};
}
test('duplicate impressions charge once; concurrent delivery cannot overspend',async()=>{
  const state=ledger();state.ad.fundedMicros=1020n;const api=await load('lib/ad-delivery.ts',state.db);
  await Promise.all([api.recordAdEvent('viewer','one','IMPRESSION'),api.recordAdEvent('viewer','one','IMPRESSION')]);
  assert.equal(state.ad.spentMicros,510n);
  await Promise.all([api.recordAdEvent('viewer','two','IMPRESSION'),api.recordAdEvent('viewer','three','IMPRESSION')]);
  assert.equal(state.ad.spentMicros,1020n);assert.equal(state.ad.status,'PAUSED');assert.equal(state.events.size,2);
});
test('unpaid and owner impressions never charge; clicks need an impression',async()=>{
  const state=ledger();const api=await load('lib/ad-delivery.ts',state.db);
  assert.equal((await api.recordAdEvent('viewer','one','CLICK')).accepted,false);
  state.ad.checkoutPaid=false;
  assert.equal((await api.recordAdEvent('viewer','one','IMPRESSION')).accepted,false);
  await assert.rejects(api.recordAdEvent('owner','one','IMPRESSION'));
  assert.equal(state.ad.spentMicros,0n);
});
test('test delivery is tester-only, consumes simulated budget and records no real charge',async()=>{
  const state=ledger();
  Object.assign(state.ad,{isTest:true,testViewerIds:['viewer'],checkoutPaid:false});
  const api=await load('lib/ad-delivery.ts',state.db);
  await assert.rejects(api.recordAdEvent('outsider','one','IMPRESSION'),/Not a campaign tester/);
  assert.equal((await api.recordAdEvent('viewer','one','IMPRESSION')).accepted,true);
  assert.equal(state.ad.spentMicros,510n);
  assert.equal([...state.events.values()][0].chargeMicros,0n);
  state.ad.status='COMPLETED';
  assert.equal((await api.recordAdEvent('viewer','two','IMPRESSION')).accepted,false);
});
test('all-user test delivery reaches the advertiser despite original targeting and never charges real funds',async()=>{
  const state=ledger();
  Object.assign(state.ad,{isTest:true,testViewerIds:['*'],checkoutPaid:false});
  state.ad.ownerId='viewer';
  const api=await load('lib/ad-delivery.ts',state.db);
  assert.equal((await api.recordAdEvent('viewer','one','IMPRESSION')).accepted,true);
  assert.equal(state.ad.spentMicros,510n);
  assert.equal([...state.events.values()][0].chargeMicros,0n);
});
test('revoked approval blocks events even with a previously issued delivery',async()=>{
  const state=ledger();state.ad.reviewStatus='REJECTED';
  const api=await load('lib/ad-delivery.ts',state.db);
  assert.equal((await api.recordAdEvent('viewer','one','IMPRESSION')).accepted,false);
  assert.equal(state.events.size,0);
});
test('campaigns charge only their selected objective',async()=>{
  const state=ledger();const api=await load('lib/ad-delivery.ts',state.db);
  state.ad.fundedMicros=200000n;
  await api.recordAdEvent('viewer','one','IMPRESSION');
  state.ad.metric='CPC';
  await api.recordAdEvent('viewer','two','IMPRESSION');
  assert.equal(state.ad.spentMicros,510n);
  await api.recordAdEvent('viewer','two','CLICK');
  assert.equal(state.ad.spentMicros,100510n);
});
test('payment fulfillment verifies amount and applies funding only once',async()=>{
  const campaign:any={ownerId:'owner',fundedMicros:0n,spentMicros:0n,status:'PAUSED',reviewStatus:'APPROVED',startDate:new Date(0),endDate:new Date('2099-01-01')};
  const funding:any={id:'f',campaignId:'ad',provider:'STRIPE',stripeSessionId:'cs',amountCents:800,paidAt:null,campaign};
  let funded=0n;
  const tx={$queryRaw:async()=>[],adFunding:{findUniqueOrThrow:async()=>funding,update:async({data}:any)=>Object.assign(funding,data)},adCampaign:{update:async({data}:any)=>{funded+=data.fundedMicros.increment;if(data.status)campaign.status=data.status;}}};
  const api=await load('lib/ad-checkout.ts',{$transaction:async(fn:any)=>fn(tx)});
  const session={id:'cs',payment_status:'paid',currency:'usd',amount_total:800,metadata:{fundingId:'f',userId:'owner'}};
  await assert.rejects(api.fulfillAdFunding({...session,amount_total:1}));
  assert.equal(funded,0n);
  await api.fulfillAdFunding(session);await api.fulfillAdFunding(session);
  assert.equal(funded,8000000n);
  assert.equal(campaign.status,'ACTIVE');
});
test('Paystack M-PESA funding resumes only approved depleted campaigns still in flight',async()=>{
  const campaign:any={fundedMicros:0n,spentMicros:1000000n,status:'PAUSED',reviewStatus:'APPROVED',startDate:new Date(0),endDate:new Date('2099-01-01')};
  const funding:any={id:'f',campaignId:'ad',provider:'PAYSTACK',amountCents:500,amountLocalCents:65000,paidAt:null,campaign};
  const tx={$queryRaw:async()=>[],adFunding:{findUniqueOrThrow:async()=>funding,update:async({data}:any)=>Object.assign(funding,data)},
    adCampaign:{update:async({data}:any)=>{campaign.fundedMicros+=data.fundedMicros.increment;if(data.status)campaign.status=data.status;}}};
  const api=await load('lib/ad-checkout.ts',{$transaction:async(fn:any)=>fn(tx)});
  await api.fulfillPaystackAd({reference:'adfund_f',status:'success',currency:'KES',amount:65000});
  assert.equal(campaign.fundedMicros,5000000n);
  assert.equal(campaign.status,'ACTIVE');

  campaign.status='PAUSED';campaign.endDate=new Date(0);funding.paidAt=null;
  await api.fulfillPaystackAd({reference:'adfund_f',status:'success',currency:'KES',amount:65000});
  assert.equal(campaign.status,'PAUSED');
});
test('Ads Center refresh reconciles a missed Paystack webhook for a depleted campaign',async()=>{
  const campaign:any={fundedMicros:0n,spentMicros:500000n,status:'PAUSED',reviewStatus:'APPROVED',startDate:new Date(0),endDate:new Date('2099-01-01')};
  const funding:any={id:'f',campaignId:'ad',provider:'PAYSTACK',amountCents:500,amountLocalCents:65000,paidAt:null,campaign};
  const db:any={$transaction:async(fn:any)=>fn({$queryRaw:async()=>[],adFunding:{findUniqueOrThrow:async()=>funding,update:async({data}:any)=>Object.assign(funding,data)},
    adCampaign:{update:async({data}:any)=>{campaign.fundedMicros+=data.fundedMicros.increment;if(data.status)campaign.status=data.status;}}}),
    adFunding:{findMany:async()=>[{id:'f'}]}};
  const api=await load('lib/ad-checkout.ts',db);
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({status:true,data:{reference:'adfund_f',status:'success',currency:'KES',amount:65000}}),{status:200});
  try {
    await api.reconcilePendingPaystackAdFunding(['ad']);
  } finally {
    globalThis.fetch=originalFetch;
  }
  assert.equal(campaign.fundedMicros,5000000n);
  assert.equal(campaign.status,'ACTIVE');
});
test('feed spaces ads after five organic posts without treating feed construction as an impression',async()=>{
  const deliveries:any[]=[];const state={id:'state',lastAdId:null};
  const ads=['A','B'].map(id=>({id,status:'ACTIVE',reviewStatus:'APPROVED',checkoutPaid:true,
    owner:{id:'owner',media:[{id:`media${id}`}]},media:{id:`media${id}`,adCtaColor:'#FF9800'},fundedMicros:1000000n,spentMicros:0n,
    budgetMicros:1000000n,dailyBudgetMicros:120000n,pacingTokensMicros:10000n,pacingSpentMicros:0n,
    pacingUpdatedAt:new Date(),pacingDay:new Date().toISOString().slice(0,10),timezoneOffsetMinutes:0,
    rate:1.5,bidMultiplier:1,impressions:0,clicks:0,likes:0,comments:0,shares:0,
    createdAt:new Date(0),countries:['KE'],language:'en',subjects:['music']}));
  const exposureBatches:any[]=[];
  const tx:any={$queryRaw:async()=>[],user:{findUniqueOrThrow:async()=>({country:'KE',language:'en',interests:['music'],blockedUsers:[],blockedByUsers:[]})},
    adFeedDay:{upsert:async()=>state,update:async({data}:any)=>Object.assign(state,data)},feedExposure:{groupBy:async()=>[],createMany:async({data}:any)=>{exposureBatches.push(data);return {count:data.length};}},
    adCampaign:{findMany:async()=>ads,findUniqueOrThrow:async({where}:any)=>ads.find(ad=>ad.id===where.id),
      update:async({where,data}:any)=>{const ad=ads.find(item=>item.id===where.id)!;for(const [key,value] of Object.entries(data)){
        if(value&&typeof value==='object'&&'increment' in value)(ad as any)[key]=((ad as any)[key]??0)+(value as any).increment;
        else (ad as any)[key]=value;}return ad;},updateMany:async()=>({count:1})},
    adDelivery:{groupBy:async()=>[],create:async({data}:any)=>{deliveries.push(data);return {id:`delivery${deliveries.length}`};}}};
  const api=await load('lib/ad-delivery.ts',{$transaction:async(fn:any)=>fn(tx)});
  const result=await api.promotionFeed('viewer',Array.from({length:40},(_,i)=>({user:{userId:'creator'},video:{id:`p${i}`}})),()=>0);
  let gap=0,last='';for(const entry of result){if(entry.video.adCampaignId){assert.ok(gap>=5);assert.notEqual(entry.video.adCampaignId,last);last=entry.video.adCampaignId;gap=0;}else gap++;}
  assert.equal(deliveries.length,8);assert.equal(result[5].video.adCampaignId,'A');
  assert.equal(result[5].video.id,'mediaA'); // Ads do not appear in the owner gallery.
  assert.equal(result[5].video.adCtaColor,'#FF9800');
  assert.equal(exposureBatches.length,1);assert.equal(exposureBatches[0].length,40);
});
test('weighted ad order randomizes campaigns while favoring stronger bids',async()=>{
  const api=await load('lib/ad-delivery.ts',{});
  const ads=[{id:'low',score:1},{id:'high',score:9}];
  assert.deepEqual(api.weightedAdOrder(ads,(ad:any)=>ad.score,()=>0.5).map((ad:any)=>ad.id),['high','low']);
  assert.deepEqual(api.weightedAdOrder(ads,(ad:any)=>ad.score,()=>0).map((ad:any)=>ad.id),['low','high']);
});
test('all-user test ad ignores targeting and is visible to its owner in the feed',async()=>{
  const deliveries:any[]=[];const state={id:'state',lastAdId:null};
  const ad:any={id:'test-ad',ownerId:'viewer',isTest:true,testViewerIds:['*'],status:'ACTIVE',reviewStatus:'APPROVED',checkoutPaid:false,
    owner:{id:'viewer',media:[{id:'test-media'}]},media:{id:'test-media'},fundedMicros:1000000n,spentMicros:0n,
    budgetMicros:1000000n,dailyBudgetMicros:120000n,pacingTokensMicros:10000n,pacingSpentMicros:0n,
    pacingUpdatedAt:new Date(),pacingDay:new Date().toISOString().slice(0,10),timezoneOffsetMinutes:0,
    rate:1.5,bidMultiplier:1,impressions:0,clicks:0,likes:0,comments:0,shares:0,
    createdAt:new Date(0),countries:['US'],language:'fr',subjects:['travel']};
  const tx:any={$queryRaw:async()=>[],user:{findUniqueOrThrow:async()=>({country:'KE',language:'en',interests:['music'],blockedUsers:[],blockedByUsers:[]})},
    adFeedDay:{upsert:async()=>state,update:async({data}:any)=>Object.assign(state,data)},feedExposure:{groupBy:async()=>[],createMany:async()=>({count:5})},
    adCampaign:{findMany:async()=>[ad],findUniqueOrThrow:async()=>ad,update:async({data}:any)=>{for(const [key,value] of Object.entries(data)){
      if(value&&typeof value==='object'&&'increment' in value)(ad as any)[key]=((ad as any)[key]??0)+(value as any).increment;
      else (ad as any)[key]=value;}return ad;},updateMany:async()=>({count:1})},
    adDelivery:{groupBy:async()=>[],create:async({data}:any)=>{deliveries.push(data);return {id:`delivery${deliveries.length}`};}}};
  const api=await load('lib/ad-delivery.ts',{$transaction:async(fn:any)=>fn(tx)});
  const feed=await api.promotionFeed('viewer',Array.from({length:10},(_,i)=>({user:{userId:'creator'},video:{id:`post${i}`}})));
  assert.equal(feed.some((entry:any)=>entry.video.adCampaignId==='test-ad'),true);
  assert.equal(deliveries.length,2);
});
test('organic posts remain available after repeated feed exposures',async()=>{
  const api=await load('lib/ad-delivery.ts',{});
  const organic=[
    {user:{userId:'one'},video:{id:'popular'}},
    {user:{userId:'two'},video:{id:'fresh'}},
    {user:{userId:'viewer'},video:{id:'own'}},
  ];
  const result=api.orderOrganicByExposure(
    'viewer',
    organic,
    new Map([['popular',8],['fresh',3]]),
  );
  assert.deepEqual(result.map((entry:any)=>entry.video.id),['fresh','popular']);
});
