import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

async function load(entry: string, mocks: any, realInsights = false) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false,
    platform: 'node', format: 'cjs', packages: 'external', plugins: [{name:'mocks', setup(b) {
      b.onResolve({filter:/^(server-only|@\/lib\/)/}, ({path}) => {
        if (realInsights && path.endsWith('mobile-insights')) return;
        return {path, namespace:'mock'};
      });
      b.onLoad({filter:/.*/, namespace:'mock'}, ({path}) => ({contents:
        path.endsWith('prisma') ? 'export const prisma = __mocks.prisma;' :
        path.endsWith('mobile-finance') ? 'export const financeSummary = __mocks.finance;' :
        path.endsWith('account-performance') ? 'export const accountPerformance = async () => ({});' :
        path.endsWith('mobile-session') ? 'export const getMobileSessionFromRequest = __mocks.session;' :
        path.endsWith('mobile-insights') ? 'export const accountInsights = __mocks.insights;' :
        'export const logError = () => {};'}));
    }}] });
  const module = {exports:{} as any};
  new Function('require','module','exports','__mocks', result.outputFiles[0].text)(createRequire(`${process.cwd()}/package.json`),module,module.exports,mocks);
  return module.exports;
}

test('analytics require authentication, validate periods, and use session ownership', async () => {
  const calls: any[] = [];
  let user: string | null = null;
  const route = await load('app/api/mobile/insights/route.ts', {
    session: async () => user ? {userId:user} : null,
    insights: async (...args:any[]) => { calls.push(args); return {}; },
  });
  assert.equal((await route.GET(new Request('https://app/api?days=7'))).status,401);
  user = 'owner';
  assert.equal((await route.GET(new Request('https://app/api?days=10000'))).status,400);
  const response = await route.GET(new Request('https://app/api?days=7&userId=someone-else'));
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.deepEqual(calls,[['owner',7]]);
});

test('earnings convert KES to USD without converting USD twice', async () => {
  const empty = async () => [];
  const api = await load('lib/mobile-insights.ts', {
    finance: async () => ({usdToKesRate:130,withdrawableKes:1300,pendingEarningsKes:650,totalPaidOutKes:2600}),
    prisma: {
      user:{findUniqueOrThrow:async()=>({accountType:'INDIVIDUAL'})},
      follow:{count:async()=>0},
      userMedia:{findMany:empty,aggregate:async()=>({_count:0,_sum:{}})},
      adCampaign:{findMany:empty},
      earningLot:{groupBy:async()=>[
        {source:'TIP',currency:'KES',_sum:{amount:1300},_count:1},
        {source:'TIP',currency:'USD',_sum:{amount:5},_count:1},
      ]},
      analyticsView:{aggregate:async()=>({_count:0,_sum:{watchMs:0}}),count:async()=>0,groupBy:empty},
      $queryRaw:empty,
    },
  });
  const data = await api.accountInsights('owner',7);
  assert.equal(data.currency,'USD');
  assert.equal(data.summary.earned,15);
  assert.deepEqual(data.earnings,{available:10,pending:5,paidOut:20,bySource:{TIP:15}});
});

test('entity analytics omit finances and all audience queries suppress small cohorts', async () => {
  const sql: string[] = [];
  const scopes: any[] = [];
  const empty = async (q:any) => {scopes.push(q); return [];};
  const api = await load('lib/mobile-insights.ts', {
    finance: () => {throw Error('entities must not query earnings');},
    prisma: {
      user:{findUniqueOrThrow:async()=>({accountType:'ENTITY'})},
      follow:{count:async(q:any)=>{scopes.push(q);return 0;}},
      userMedia:{findMany:empty,aggregate:async()=>({_count:0,_sum:{}})},
      adCampaign:{findMany:empty},
      analyticsView:{aggregate:async()=>({_count:0,_sum:{watchMs:0}}),count:async()=>0,groupBy:async()=>[]},
      $queryRaw:async (parts:TemplateStringsArray,...values:any[])=>{
        sql.push(parts.join('?'));
        assert.equal(values[0],'owner');
        return [];
      },
    },
  });
  const data = await api.accountInsights('owner',7,new Date('2026-10-09T12:00:00Z'));
  assert.equal(data.earnings,null);
  assert.deepEqual(data.audience,[]);
  assert.match(sql[0],/HAVING COUNT\(DISTINCT s.userId\)>=10/);
  assert.equal(data.summary.reachedAccounts,0);
  assert.equal(api.percentChange(10,0),null);
  assert.equal(api.percentChange(15,10),50);
  assert(scopes.every(q=>q.where.userId==='owner'||q.where.ownerId==='owner'||q.where.followedId==='owner'));
});
