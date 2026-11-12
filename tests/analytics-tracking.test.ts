import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';

async function harness(entry:string,mocks:any) {
  const result=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'mock',setup(b){
    b.onResolve({filter:/^(server-only|@\/lib\/)/},({path})=>({path,namespace:'mock'}));
    b.onLoad({filter:/.*/,namespace:'mock'},({path})=>({contents:
      path.endsWith('prisma')?'export const prisma=__mocks.db;':
      path.endsWith('env')?'export const env={JWT_SECRET:"test-secret-for-analytics"};':
      path.endsWith('mobile-insights')?'export const accountInsights=__mocks.insights;':
      path.endsWith('email')?'export const sendEmail=__mocks.send;':''}));
  }}]});
  const module={exports:{} as any};
  new Function('require','module','exports','__mocks',result.outputFiles[0].text)(createRequire(`${process.cwd()}/package.json`),module,module.exports,mocks);
  return module.exports;
}

test('tracking excludes own views and bounds watch time by elapsed duration',async()=>{
  const api=await harness('lib/analytics-tracking.ts',{db:{userMedia:{findFirst:async()=>({userId:'owner'})}}});
  await api.recordAnalyticsView('owner',{mediaId:'m',sessionId:'session',watchMs:500,durationMs:1000,completed:false});
  assert.equal(api.boundedWatch(100000,100000,1000),3000);
  assert.equal(api.boundedWatch(100000,4000,10000),4000);
  assert.equal(api.boundedWatch(-1,10000,10000),0);
});

test('concurrent report workers cannot send without winning the lease',async()=>{
  const api=await harness('lib/analytics-reports.ts',{db:{analyticsReportSchedule:{
    findMany:async()=>[{userId:'owner'}],updateMany:async()=>({count:0}),
  }},send:()=>{throw Error('must not send');}});
  assert.deepEqual(await api.deliverAnalyticsReports(),{sent:0});
});

test('report generation failure retries later without recording a successful send',async()=>{
  const updates:any[]=[];
  const api=await harness('lib/analytics-reports.ts',{db:{
    user:{findFirst:async()=>({email:'owner@example.com'})},
    analyticsReportSchedule:{findMany:async()=>[{userId:'owner',frequency:7}],updateMany:async(q:any)=>{updates.push(q);return {count:1};}},
  },insights:async()=>{throw Error('offline');}});
  assert.deepEqual(await api.deliverAnalyticsReports(new Date('2026-10-09T12:00:00Z')),{sent:0});
  assert.equal(updates.at(-1).data.lastSentAt,undefined);
  assert.equal(updates.at(-1).data.nextRunAt.toISOString(),'2026-10-09T13:00:00.000Z');
});

test('account performance scopes metrics to owner and exposes Business limits',async()=>{
  const queries:any[]=[];
  const api=await harness('lib/account-performance.ts',{db:{
    user:{findUniqueOrThrow:async(q:any)=>{queries.push(q);return {accountType:'ENTITY',entityPlanType:'BUSINESS',entityPlanExpiresAt:new Date('2027-01-01')};}},
    $queryRaw:async(strings:any,...values:any[])=>{assert.ok(values.includes('owner'));return strings.join('').includes('AccountAnalyticsEvent')?[{day:'2026-10-09',kind:'UNFOLLOW',total:2n}]:[{received:4n,replied:3n,averageSeconds:60}];},
    callBooking:{groupBy:async(q:any)=>{queries.push(q);return [{type:'VOICE',_count:2},{type:'VIDEO',_count:1}];},count:async(q:any)=>{queries.push(q);return 1;}},
    chatMessage:{count:async(q:any)=>{queries.push(q);return 8;}},
    videoComment:{findMany:async(q:any)=>{queries.push(q);return [];}}
  }});
  const result=await api.accountPerformance('owner',new Date('2026-10-01'),new Date('2026-10-09T12:00:00Z'));
  assert.equal(result.messaging.dailyLimit,70);
  assert.equal(result.calls.dailyLimit,20);
  assert.equal(result.messaging.unanswered,1);
  assert.equal(result.messaging.replyRate,75);
  assert.equal(result.calls.received,3);
  assert.equal(result.events[0].total,2);
  for(const query of queries) assert.ok(JSON.stringify(query.where).includes('owner'));
});

test('comment attachments must be owned uploads with supported types',async()=>{
  let selected:any;
  const api=await harness('lib/mobile-comments.ts',{db:{asset:{findFirst:async(q:any)=>{selected=q;return null;}}}});
  await assert.rejects(api.createComment('post','author','',undefined,{url:'https://example.com/file.gif',kind:'gif'}),/supported image/);
  assert.equal(selected.where.objectKey.startsWith,'uploads/author/');
  assert.equal(selected.where.metadata.equals,'author');
  assert.equal(selected.where.visibility,'public');
});
