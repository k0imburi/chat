import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

// Handler-level simulation, not an HTTP/device/database integration test.
// Payment/review completion, organic discovery, authentication and profile
// serialization are fixtures. Ad validation, pricing, publishing, selection,
// pacing, event charging and metrics execute their actual production code.
const root = fileURLToPath(new URL('../', import.meta.url));
type Row = Record<string, any>;

async function harness() {
  const campaigns: Row[] = [], media: Row[] = [], deliveries: Row[] = [], events: Row[] = [];
  const days = new Map<string, Row>();
  const proof = new Set<string>();
  const organic = Array.from({length: 5}, (_, i) => ({user: {userId: 'creator'}, video: {id: `organic-${i}`}}));
  const owner = {id: 'owner', accountType: 'PERSONAL', isActive: true, status: 'ACTIVE'};
  const viewer = {id: 'viewer', country: 'KE', language: 'en', interests: ['music'], birthday: new Date('1990-01-01'), blockedUsers: [], blockedByUsers: []};
  function matches(row: Row, where: Row): boolean {
    return Object.entries(where).every(([key, value]) => {
      if (key === 'OR') return value.some((branch: Row) => matches(row, branch));
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        if ('array_contains' in value) return Array.isArray(row[key]) && value.array_contains.every((item: unknown) => row[key].includes(item));
        if ('notIn' in value) return !value.notIn.includes(row[key]);
        if ('in' in value) return value.in.includes(row[key]);
        if ('lte' in value) return row[key] <= value.lte;
        if ('gt' in value) return row[key] > value.gt;
        return row[key] != null && matches(row[key], value);
      }
      return row[key] === value;
    });
  }
  function joined(ad: Row) {
    return {...ad, owner: {...owner, media: media.filter(m => m.userId === ad.ownerId)}, media: media.find(m => m.adCampaignId === ad.id)};
  }
  function update(row: Row, data: Row) {
    for (const [key, value] of Object.entries(data)) {
      row[key] = value && typeof value === 'object' && 'increment' in value ? row[key] + value.increment : value;
    }
    return {...row};
  }
  const db: Row = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
      if (strings.join('').includes('SUM(e.chargeMicros)')) {
        const sums = new Map<string, Row>();
        for (const event of events) {
          const delivery = deliveries.find(d => d.id === event.deliveryId)!;
          if (!campaigns.some(a => a.id === delivery.campaignId && a.ownerId === values[0])) continue;
          const key = `${delivery.campaignId}:${event.kind}`;
          const row = sums.get(key) ?? {campaignId: delivery.campaignId, kind: event.kind, total: 0n};
          row.total += event.chargeMicros; sums.set(key, row);
        }
        return [...sums.values()];
      }
      assert.match(strings.join(''), /SELECT id FROM (AdCampaign|users).*FOR UPDATE/);
      return [];
    },
    user: {
      findUniqueOrThrow: async ({where}: Row) => where.id === 'owner' ? owner : viewer,
      findMany: async () => [],
    },
    asset: {findMany: async ({where}: Row) => where.objectKey.startsWith === 'uploads/owner/' && where.metadata.equals === 'owner'
      ? [{url: 'https://assets.example/creative.jpg', contentType: 'image/jpeg'}].filter(a => where.url.in.includes(a.url)) : []},
    adCampaign: {
      count: async ({where}: Row) => campaigns.filter(a => matches(a, where)).length,
      create: async ({data}: Row) => {
        const ad = {id: randomUUID(), isTest: false, testViewerIds: null, createdAt: new Date(), fundedMicros: 0n, spentMicros: 0n,
          pacingTokensMicros: 0n, pacingSpentMicros: 0n, pacingDay: null, pacingUpdatedAt: null,
          publishedAt: null, autoRenew: false, impressions: 0, clicks: 0, likes: 0, comments: 0, shares: 0,
          pacedSkips: 0, auctionLosses: 0, ...data};
        campaigns.push(ad); return {...ad};
      },
      findMany: async ({where, include}: Row) => campaigns.filter(a => matches(joined(a), where)).map(a => include ? joined(a) : {...a}),
      findFirstOrThrow: async ({where}: Row) => {
        const ad = campaigns.find(a => matches(a, where));
        if (!ad) throw new Error('Campaign not found.');
        return joined(ad);
      },
      findUniqueOrThrow: async ({where}: Row) => {
        const ad = campaigns.find(a => a.id === where.id);
        assert.ok(ad); return joined(ad);
      },
      update: async ({where, data}: Row) => {
        const ad = campaigns.find(a => a.id === where.id); assert.ok(ad); return update(ad, data);
      },
      updateMany: async ({where, data}: Row) => {
        const rows = campaigns.filter(a => matches(a, where)); rows.forEach(a => update(a, data)); return {count: rows.length};
      },
    },
    userMedia: {
      findUnique: async ({where}: Row) => media.find(m => matches(m, where)) ?? null,
      upsert: async ({where, create}: Row) => {
        let row = media.find(m => matches(m, where));
        if (!row) {
          const created: Row = {id: randomUUID(), isHiddenByOwner: false, reportStatus: null, copyrightStatus: null, ...create};
          media.push(created); row = created;
        }
        return row;
      },
    },
    adFeedDay: {
      upsert: async ({where, create}: Row) => {if (!days.has(where.id)) days.set(where.id, {...create, lastAdId: null}); return {...days.get(where.id)};},
      update: async ({where, data}: Row) => update(days.get(where.id)!, data),
    },
    feedExposure: {groupBy: async () => [], createMany: async ({data}: Row) => ({count: data.length})},
    adDelivery: {
      groupBy: async ({where}: Row) => campaigns.map(a => ({campaignId: a.id, _count: deliveries.filter(d => matches(d, where) && d.campaignId === a.id).length})),
      create: async ({data}: Row) => {const row = {id: randomUUID(), createdAt: new Date(), ...data}; deliveries.push(row); return row;},
      findFirst: async ({where}: Row) => deliveries.find(d => matches(d, where)) ?? null,
    },
    adEvent: {
      findUnique: async ({where}: Row) => events.find(e => matches(e, where.deliveryId_kind)) ?? null,
      create: async ({data}: Row) => {assert.ok(!events.some(e => e.deliveryId === data.deliveryId && e.kind === data.kind)); events.push(data); return data;},
    },
    videoLike: {findFirst: async () => proof.has('LIKE') ? {id: 'like'} : null},
    videoComment: {findFirst: async () => proof.has('COMMENT') ? {id: 'comment'} : null},
    mediaRepost: {findFirst: async () => proof.has('SHARE') ? {id: 'share'} : null},
    appSettings: {findUnique: async () => ({usdToKesRate: 130})},
  };
  // Sequential tests only: this mock does not model rollback or database locks.
  db.$transaction = async (fn: (tx: Row) => unknown) => fn(db);
  const boundaries: Record<string, string> = {
    'server-only': '',
    '@/lib/prisma': 'export const prisma = __state.db;',
    '@/lib/mobile-session': 'export const getMobileSessionFromRequest = async r => r.headers.get("x-test-user") ? {userId:r.headers.get("x-test-user")} : null;',
    '@/lib/customer-mobile-session': 'export const getCustomerOrMobileSession = async r => r.headers.get("x-test-user") ? {userId:r.headers.get("x-test-user")} : null;',
    '@/lib/mobile-notifications': 'export const createUserNotification = async () => {throw new Error("Unexpected notification");};',
    '@/lib/log-error': 'export const logError = (...args) => __state.errors.push(args);',
    '@/lib/env': 'export const env = {APP_URL:"https://simulation.invalid"};',
    '@/lib/ad-checkout': 'export const adCheckout = async () => {throw new Error("Payment provider intentionally unavailable in simulation");}; export const reconcilePendingPaystackAdFunding = async () => {};',
    '@/lib/mobile-discover': 'export const getDiscoverFeed = async () => __state.organic; export const getTrendingFeed = getDiscoverFeed;',
    '@/lib/mobile-feed': 'export const getFollowingFeed = async () => __state.organic;',
    '@/lib/mobile-users': 'export const languageTokens = s => new Set([s]); export const serializeMobileUserWithLikes = u => ({userId:u.id,gallery:u.media});',
  };
  const errors: unknown[] = [];
  const routes: Row = {};
  for (const [name, path] of Object.entries({ads: 'ads', quote: 'ads/quote', action: 'ads/[id]', events: 'ads/events', discover: 'discover', following: 'feed'})) {
    const result = await build({absWorkingDir: root, entryPoints: [`app/api/mobile/${path}/route.ts`], bundle: true,
      write: false, platform: 'node', format: 'cjs', packages: 'external', plugins: [{name: 'isolated-boundaries', setup(b) {
        b.onResolve({filter: /^(server-only|@\/lib\/)/}, ({path}) => path in boundaries ? {path, namespace: 'fixture'} : undefined);
        b.onLoad({filter: /.*/, namespace: 'fixture'}, ({path}) => ({contents: boundaries[path]}));
      }}]});
    const loaded = {exports: {} as Row};
    new Function('require', 'module', 'exports', '__state', result.outputFiles[0].text)(createRequire(`${root}package.json`), loaded, loaded.exports, {db, organic, errors});
    routes[name] = loaded.exports;
  }
  async function call(route: string, user: string | null, body?: Row, id?: string) {
    const response = await routes[route][body ? 'POST' : 'GET'](new Request(`https://simulation.invalid/api/mobile/${route}`, {
      method: body ? 'POST' : 'GET', headers: {...(user ? {'x-test-user': user} : {}), 'Content-Type': 'application/json'},
      ...(body ? {body: JSON.stringify(body)} : {}),
    }), {params: Promise.resolve({id})});
    return {status: response.status, body: await response.json()};
  }
  return {call, campaigns, deliveries, events, media, proof, errors, organic, viewer};
}

const input = (metric = 'CPM') => ({name: 'Music workshop', caption: 'Learn piano', mediaUrls: ['https://assets.example/creative.jpg'],
  websiteUrl: 'https://example.com/workshop', ctaLabel: 'Learn More', countries: ['KE'], subjects: ['music'],
  startDate: new Date().toISOString(), durationDays: 1, metric, goal: 1000, bidMultiplier: 1,
  ...(metric === 'CPM' ? {dailyBudgetUsd: 2.5} : {})});

for (const metric of ['CPM', 'CPC', 'CPE']) test(`${metric}: actual mobile routes create, quote, publish, discover, events, metrics and pause`, async () => {
  const h = await harness();
  const quote = await h.call('quote', 'owner', input(metric));
  assert.equal(quote.status, 200);
  const created = await h.call('ads', 'owner', input(metric));
  assert.equal(created.status, 201);
  const id = created.body.data.id;
  assert.equal(created.body.data.budget, quote.body.data.budgetCents / 100);
  assert.equal(created.body.data.reviewStatus, 'PENDING');
  assert.equal(created.body.data.status, 'DRAFT');
  assert.equal((await h.call('action', 'owner', {action: 'publish'}, id)).status, 400);
  assert.equal(h.media.length, 0);
  // Fixture transition only: neither checkout nor review approval is exercised.
  Object.assign(h.campaigns[0], {checkoutPaid: true, fundedMicros: h.campaigns[0].budgetMicros});
  assert.equal((await h.call('action', 'owner', {action: 'publish'}, id)).body.data.status, 'PENDING_REVIEW');
  assert.equal((await h.call('discover', 'viewer')).body.data.length, 5);
  h.campaigns[0].reviewStatus = 'APPROVED';
  const published = await h.call('action', 'owner', {action: 'publish'}, id);
  assert.equal(published.status, 200); assert.equal(published.body.data.status, 'ACTIVE');
  await h.call('action', 'owner', {action: 'publish'}, id);
  assert.equal(h.media.length, 1);
  const feed = await h.call('discover', 'viewer');
  assert.equal(feed.status, 200); assert.equal(feed.body.data.length, 6);
  const ad = feed.body.data[5].video;
  assert.equal(ad.adCampaignId, id); assert.equal(ad.adCta, 'Learn More');
  assert.equal(ad.adWebsite, input().websiteUrl);
  const event = (kind: string, user = 'viewer') => h.call('events', user, {deliveryId: ad.adDeliveryId, kind});
  assert.equal((await event('CLICK')).body.data.accepted, false);
  assert.equal((await event('IMPRESSION', 'stranger')).status, 400);
  assert.equal((await event('IMPRESSION')).body.data.accepted, true);
  assert.equal((await event('IMPRESSION')).body.data.accepted, true);
  assert.equal((await event('CLICK')).body.data.accepted, true);
  for (const kind of ['LIKE', 'COMMENT', 'SHARE']) {
    assert.equal((await event(kind)).body.data.accepted, false);
    h.proof.add(kind);
    assert.equal((await event(kind)).body.data.accepted, true);
    assert.equal((await event(kind)).body.data.accepted, true);
  }
  assert.equal(h.events.length, 5);
  const expectedSpend = metric === 'CPM' ? 0.00051 : metric === 'CPC' ? 0.1 : 0.3;
  const metrics = await h.call('ads', 'owner');
  assert.equal(metrics.status, 200);
  const stats = metrics.body.data[0];
  assert.equal(stats.impressions, 1); assert.equal(stats.clicks, 1); assert.equal(stats.engagements, 3);
  assert.equal(stats.spend, expectedSpend); assert.equal(stats.remaining, stats.funded - expectedSpend);
  assert.equal(stats.localSpend, expectedSpend * 130);
  assert.ok(Math.abs(stats.costBreakdown.reduce((n: number, c: Row) => n + c.cost, 0) - expectedSpend) < 1e-12);
  assert.deepEqual((await h.call('ads', 'stranger')).body.data, []);
  assert.equal((await h.call('action', 'stranger', {action: 'publish'}, id)).status, 400);
  assert.equal((await h.call('action', 'stranger', {action: 'pause'}, id)).status, 400);
  assert.equal(h.campaigns[0].status, 'ACTIVE');
  assert.equal((await h.call('action', 'owner', {action: 'pause'}, id)).status, 200);
  assert.equal((await h.call('ads', 'owner')).body.data[0].deliveryState, 'Paused');
  assert.equal((await h.call('discover', 'viewer')).body.data.length, 5);
  // A fresh delivery fixture avoids testing the accepted duplicate-event branch.
  const pendingId = randomUUID(); h.deliveries.push({...h.deliveries[0], id: pendingId});
  assert.equal((await h.call('events', 'viewer', {deliveryId: pendingId, kind: 'IMPRESSION'})).body.data.accepted, false);
  assert.equal(h.events.length, 5); assert.deepEqual(h.errors, []);
});

test('mobile ad routes reject unauthenticated and malformed requests without persistence writes', async () => {
  const h = await harness();
  for (const [route, body] of [['ads', input()], ['quote', input()], ['action', {action: 'pause'}], ['events', {deliveryId: randomUUID(), kind: 'IMPRESSION'}]] as const) {
    assert.equal((await h.call(route, null, body)).status, 401);
  }
  for (const route of ['ads', 'discover']) assert.equal((await h.call(route, null)).status, 401);
  assert.equal((await h.call('ads', 'owner', {...input(), mediaUrls: ['https://assets.example/not-owned.jpg']})).status, 400);
  assert.equal((await h.call('quote', 'owner', {...input(), countries: ['CN']})).status, 400);
  assert.equal((await h.call('events', 'viewer', {deliveryId: 'invalid', kind: 'IMPRESSION'})).status, 400);
  assert.equal((await h.call('events', 'viewer', {deliveryId: randomUUID(), kind: 'INVALID'})).status, 400);
  assert.equal(h.campaigns.length, 0); assert.equal(h.events.length, 0); assert.equal(h.deliveries.length, 0);
});

test('admin-created test fixture: tester-only delivery, simulated spend, zero real charges and mobile restrictions', async () => {
  const h = await harness();
  const created = await h.call('ads', 'owner', input());
  assert.equal(created.status, 201);
  const id = created.body.data.id;
  Object.assign(h.campaigns[0], {checkoutPaid: true, fundedMicros: h.campaigns[0].budgetMicros, reviewStatus: 'APPROVED'});
  assert.equal((await h.call('action', 'owner', {action: 'publish'}, id)).status, 200);
  // Stand-in for the admin copy action; the admin route/authorization itself is not invoked.
  Object.assign(h.campaigns[0], {isTest: true, checkoutPaid: false, testViewerIds: ['viewer']});
  for (const action of ['publish', 'checkout', 'republish', 'set_auto_renew']) {
    const response = await h.call('action', 'owner', {action, requestKey: randomUUID(), enabled: true}, id);
    assert.equal(response.status, 400);
    assert.match(response.body.message, /administrator/);
  }
  assert.equal((await h.call('discover', 'stranger')).body.data.length, 5);
  assert.equal(h.deliveries.length, 0);
  const feed = await h.call('discover', 'viewer');
  assert.equal(feed.status, 200); assert.equal(feed.body.data.length, 6);
  const deliveryId = feed.body.data[5].video.adDeliveryId;
  h.campaigns[0].reviewStatus = 'PENDING';
  assert.equal((await h.call('events', 'viewer', {deliveryId, kind: 'IMPRESSION'})).body.data.accepted, false);
  h.campaigns[0].reviewStatus = 'APPROVED';
  h.campaigns[0].testViewerIds = [];
  assert.equal((await h.call('events', 'viewer', {deliveryId, kind: 'IMPRESSION'})).status, 400);
  h.campaigns[0].testViewerIds = ['viewer'];
  for (let i = 0; i < 2; i++) assert.equal((await h.call('events', 'viewer', {deliveryId, kind: 'IMPRESSION'})).body.data.accepted, true);
  assert.equal(h.events.length, 1); assert.equal(h.events[0].chargeMicros, 0n);
  assert.equal(h.campaigns[0].spentMicros, 510n);
  const metrics = await h.call('ads', 'owner');
  assert.equal(metrics.status, 200);
  const stats = metrics.body.data[0];
  assert.equal(stats.isTest, true); assert.equal(stats.spend, 0.00051);
  assert.equal(stats.costBreakdown[0].cost, 0);
  assert.equal((await h.call('action', 'owner', {action: 'pause'}, id)).status, 200);
  assert.equal(h.campaigns[0].status, 'PAUSED');
  assert.deepEqual(h.errors, []);
});

test('eligible ads are also inserted into the Following feed for followers', async () => {
  const h = await harness();
  const created = await h.call('ads', 'owner', input());
  const id = created.body.data.id;
  Object.assign(h.campaigns[0], {
    checkoutPaid: true,
    fundedMicros: h.campaigns[0].budgetMicros,
    reviewStatus: 'APPROVED',
  });
  assert.equal((await h.call('action', 'owner', {action: 'publish'}, id)).status, 200);

  const feed = await h.call('following', 'viewer');
  assert.equal(feed.status, 200);
  assert.equal(feed.body.data.length, 6);
  assert.equal(feed.body.data[5].video.adCampaignId, id);
  assert.deepEqual(h.errors, []);
});

test('expired auto-renew campaigns resume during feed delivery without opening Ads Center', async () => {
  const h = await harness();
  const created = await h.call('ads', 'owner', input());
  const id = created.body.data.id;
  Object.assign(h.campaigns[0], {
    checkoutPaid: true,
    fundedMicros: h.campaigns[0].budgetMicros,
    reviewStatus: 'APPROVED',
  });
  assert.equal((await h.call('action', 'owner', {action: 'publish'}, id)).status, 200);
  const yesterday = new Date(Date.now() - 86400000);
  Object.assign(h.campaigns[0], {
    autoRenew: true,
    startDate: new Date(yesterday.getTime() - 86400000),
    endDate: yesterday,
    status: 'ACTIVE',
  });

  const feed = await h.call('discover', 'viewer');
  assert.equal(feed.status, 200);
  assert.equal(feed.body.data[5].video.adCampaignId, id);
  assert.equal(h.campaigns[0].status, 'ACTIVE');
  assert.ok(h.campaigns[0].startDate > yesterday);
  assert.ok(h.campaigns[0].endDate > new Date());
});

test('a depleted campaign can enter republish checkout before its old end date', async () => {
  const h = await harness();
  const created = await h.call('ads', 'owner', input());
  const id = created.body.data.id;
  Object.assign(h.campaigns[0], {
    checkoutPaid: true,
    fundedMicros: h.campaigns[0].budgetMicros,
    spentMicros: h.campaigns[0].budgetMicros,
    reviewStatus: 'APPROVED',
    publishedAt: new Date(),
    status: 'PAUSED',
  });
  const response = await h.call('action', 'owner', {action: 'republish', requestKey: randomUUID()}, id);
  assert.equal(response.status, 400);
  assert.match(response.body.message, /Payment provider intentionally unavailable/);
  assert.equal(h.campaigns[0].status, 'PAUSED');
});

test('entity accounts receive ads without personal language, interests or demographics', async () => {
  const h = await harness();
  const created = await h.call('ads', 'owner', input());
  const id = created.body.data.id;
  Object.assign(h.campaigns[0], {
    checkoutPaid: true,
    fundedMicros: h.campaigns[0].budgetMicros,
    reviewStatus: 'APPROVED',
  });
  assert.equal((await h.call('action', 'owner', {action: 'publish'}, id)).status, 200);
  Object.assign(h.viewer, {
    accountType: 'ENTITY',
    language: null,
    interests: [],
    birthday: null,
    gender: null,
  });

  const feed = await h.call('discover', 'viewer');
  assert.equal(feed.status, 200);
  assert.equal(feed.body.data[5].video.adCampaignId, id);
  assert.deepEqual(h.errors, []);
});

test('a single eligible campaign keeps its five-post cadence across fresh feed requests', async () => {
  const h = await harness();
  h.organic.push(...Array.from({length: 15}, (_, i) => ({user: {userId: 'creator'}, video: {id: `extra-${i}`}})));
  const created = await h.call('ads', 'owner', input());
  const id = created.body.data.id;
  Object.assign(h.campaigns[0], {
    checkoutPaid: true,
    fundedMicros: h.campaigns[0].budgetMicros,
    reviewStatus: 'APPROVED',
  });
  assert.equal((await h.call('action', 'owner', {action: 'publish'}, id)).status, 200);

  const firstFeed = await h.call('following', 'viewer');
  assert.equal(firstFeed.body.data.filter((entry: Row) => entry.video.adCampaignId === id).length, 4);
  assert.equal(h.deliveries.filter((delivery: Row) => delivery.campaignId === id && delivery.viewerId === 'viewer').length, 4);
  for (let i = 0; i < 3; i++) {
    const refreshed = await h.call('following', 'viewer');
    assert.equal(refreshed.body.data.filter((entry: Row) => entry.video.adCampaignId === id).length, 4);
  }
});
