import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
type Row = Record<string, any>;
type Actions = {
  startTestAdAction(input: { campaignId: string; testerUsernames?: string[]; allUsers?: boolean; durationHours: number }): Promise<{ campaignId: string }>;
  resetAllApprovedAdsAsTestAction(durationHours: number): Promise<{ started: number; failed: string[] }>;
  stopTestAdAction(campaignId: string): Promise<{ stopped: boolean }>;
};

// Actual server actions run here; authentication, persistence and publishing are boundaries.
async function harness(role = "ADMIN") {
  const original: Row = {
    id: "original", ownerId: "advertiser", name: "Workshop", isTest: false,
    caption: "Learn piano", mediaUrls: ["https://assets.example/piano.jpg"],
    websiteUrl: "https://example.com", ctaLabel: "Learn More", language: "en",
    countries: ["KE"], subjects: ["music"],
    creative: { title: "Piano", taggedUserIds: ["tagged"], taggedUsernames: ["tagged-user"] },
    metric: "CPM", rate: 0.5, bidMultiplier: 1, timezoneOffsetMinutes: 180,
    budgetMicros: 50000000n, dailyBudgetMicros: 20000000n,
    fundedMicros: 50000000n, spentMicros: 123000n, checkoutPaid: true,
    autoRenew: true, reviewStatus: "PENDING", status: "PENDING_REVIEW",
  };
  const campaigns = [original];
  const users = [
    { id: "tester-a", username: "alice", isActive: true, status: "ACTIVE" },
    { id: "tester-b", username: "bob", isActive: true, status: "ACTIVE" },
    { id: "advertiser", username: "owner", isActive: true, status: "ACTIVE" },
  ];
  const calls: { operation: string; args: Row }[] = [];
  const publishCalls: unknown[][] = [];
  const fundingCalls: string[] = [];
  const funding = [{ campaignId: "original", amountCents: 5000 }];
  const forbidden = (name: string) => new Proxy({}, {
    get(_target, method) {
      fundingCalls.push(`${name}.${String(method)}`);
      throw new Error(`Unexpected ${name}.${String(method)}`);
    },
  });
  const db = new Proxy({
    adCampaign: {
      async findUniqueOrThrow(args: Row) {
        calls.push({ operation: "find", args });
        const row = campaigns.find((campaign) => campaign.id === args.where.id);
        assert.ok(row);
        return structuredClone(row);
      },
      async findMany(args: Row) {
        calls.push({ operation: "findMany", args });
        return campaigns.filter((row) => Object.entries(args.where).every(([key, value]) => row[key] === value))
          .map((row) => structuredClone(row));
      },
      async create(args: Row) {
        calls.push({ operation: "create", args });
        const row = { ...structuredClone(args.data), id: "test-copy" };
        campaigns.push(row);
        return structuredClone(row);
      },
      async updateMany(args: Row) {
        calls.push({ operation: "updateMany", args });
        const rows = campaigns.filter((row) => Object.entries(args.where).every(([key, value]) => row[key] === value));
        rows.forEach((row) => Object.assign(row, args.data));
        return { count: rows.length };
      },
    },
    user: {
      async findMany(args: Row) {
        calls.push({ operation: "testers", args });
        return users.filter((user) => args.where.username.in.includes(user.username)
          && user.isActive === args.where.isActive && !args.where.status.notIn.includes(user.status))
          .map(({ id, username }) => ({ id, username }));
      },
    },
    adFunding: forbidden("adFunding"), wallet: forbidden("wallet"),
  }, {
    get(target, key) {
      assert.ok(key in target, `Unexpected Prisma access: ${String(key)}`);
      return Reflect.get(target, key);
    },
  });
  const boundaries: Record<string, string> = {
    "@/lib/auth": "export const requireSessionUser = async () => ({id: 'admin', role: __state.role});",
    "@/lib/prisma": "export const prisma = __state.db;",
    "@/lib/mobile-ads": "export const publishAd = async (...args) => { __state.publishCalls.push(args); };",
    "@/lib/mobile-notifications": "export const createUserNotification = async () => { throw new Error('Unexpected notification'); };",
    "next/cache": "export const revalidatePath = () => {};",
  };
  const result = await build({
    absWorkingDir: root, entryPoints: ["lib/actions/ad-review.ts"], bundle: true,
    write: false, platform: "node", format: "cjs", packages: "external",
    plugins: [{ name: "action-boundaries", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\// }, ({ path }) => path in boundaries ? { path, namespace: "mock" } : undefined);
      builder.onResolve({ filter: /^next\/cache$/ }, ({ path }) => ({ path, namespace: "mock" }));
      builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: boundaries[path] }));
    } }],
  });
  const module = { exports: {} as Actions };
  new Function("require", "module", "exports", "__state", result.outputFiles[0].text)(
    createRequire(`${root}package.json`), module, module.exports, { role, db, publishCalls });
  return { actions: module.exports, campaigns, original, calls, publishCalls, funding, fundingCalls };
}

test("admin can run a test for all active users without enumerating or charging accounts", async () => {
  const h = await harness();
  assert.deepEqual(await h.actions.startTestAdAction({ campaignId: "original", allUsers: true, durationHours: 2 }), { campaignId: "test-copy" });
  assert.deepEqual(h.campaigns[1].testViewerIds, ["*"]);
  assert.equal(h.campaigns[1].checkoutPaid, false);
  assert.equal(h.campaigns[1].fundedMicros, h.original.budgetMicros);
  assert.deepEqual(h.calls.map((call) => call.operation), ["find", "create"]);
  assert.deepEqual(h.fundingCalls, []);
});

test("bulk reset gives depleted approved campaigns fresh test budgets and timers without billing", async () => {
  const h = await harness();
  Object.assign(h.original, { reviewStatus: "APPROVED", status: "PAUSED", fundedMicros: 50000000n, spentMicros: 50000000n });
  h.campaigns.push({
    id: "old-test-copy", isTest: true, status: "ACTIVE", autoRenew: false,
    creative: { sourceCampaignId: "original" },
  });
  const start = Date.now();
  const result = await h.actions.resetAllApprovedAdsAsTestAction(2);
  assert.equal(result.started, 1);
  assert.deepEqual(result.failed, []);
  const copy = h.campaigns.find((campaign) => campaign.id === "test-copy");
  assert.ok(copy);
  assert.equal(copy.isTest, true);
  assert.equal(copy.testViewerIds[0], "*");
  assert.equal(copy.fundedMicros, h.original.budgetMicros);
  assert.equal(copy.spentMicros, 0n);
  assert.ok(copy.startDate.getTime() >= start);
  assert.equal(copy.endDate.getTime() - copy.startDate.getTime(), 2 * 3600000);
  const oldCopy = h.campaigns.find((campaign) => campaign.id === "old-test-copy");
  assert.ok(oldCopy);
  assert.equal(oldCopy.status, "COMPLETED");
  assert.deepEqual(h.fundingCalls, []);
});

const input = { campaignId: "original", testerUsernames: [" @Alice ", "alice", "BOB"], durationHours: 3 };

for (const role of ["ADMIN", "SUPER_ADMIN"]) {
  test(`${role} starts an isolated allowlisted test without changing the original or funding`, async () => {
    const h = await harness(role);
    const before = structuredClone(h.original);
    const fundingBefore = structuredClone(h.funding);
    assert.deepEqual(await h.actions.startTestAdAction(input), { campaignId: "test-copy" });
    assert.equal(h.campaigns.length, 2);
    const copy = h.campaigns[1];
    assert.notEqual(copy.id, h.original.id);
    assert.equal(copy.isTest, true);
    assert.equal(copy.checkoutPaid, false);
    assert.equal(copy.autoRenew, false);
    assert.equal(copy.reviewStatus, "APPROVED");
    assert.equal(copy.reviewedById, "admin");
    assert.equal(copy.ownerId, before.ownerId);
    assert.deepEqual(copy.mediaUrls, before.mediaUrls);
    assert.deepEqual(copy.testViewerIds, ["tester-a", "tester-b"]);
    assert.deepEqual(copy.creative, { ...before.creative, taggedUserIds: [], taggedUsernames: [], sourceCampaignId: "original" });
    assert.equal(copy.fundedMicros, 50000000n);
    assert.equal(copy.budgetMicros, copy.fundedMicros);
    assert.equal(copy.dailyBudgetMicros, 20000000n);
    assert.equal(copy.endDate.getTime() - copy.startDate.getTime(), 3 * 3600000);
    assert.deepEqual(h.publishCalls, [["advertiser", "test-copy", true]]);
    assert.deepEqual(h.original, before);
    assert.deepEqual(h.funding, fundingBefore);
    assert.deepEqual(h.fundingCalls, []);
    assert.deepEqual(h.calls.map((call) => call.operation), ["find", "testers", "create"]);
  });

  test(`${role} stops only test campaigns`, async () => {
    const h = await harness(role);
    const before = structuredClone(h.original);
    h.campaigns.push({ id: "active-test", isTest: true, status: "ACTIVE", autoRenew: true });
    const started = Date.now();
    assert.deepEqual(await h.actions.stopTestAdAction("active-test"), { stopped: true });
    assert.deepEqual(h.calls[0].args.where, { id: "active-test", isTest: true });
    assert.equal(h.campaigns[1].status, "COMPLETED");
    assert.equal(h.campaigns[1].autoRenew, false);
    assert.ok(h.campaigns[1].endDate.getTime() >= started);
    assert.ok(h.campaigns[1].endDate.getTime() <= Date.now());
    await assert.rejects(h.actions.stopTestAdAction("original"), /Test campaign not found/);
    await assert.rejects(h.actions.stopTestAdAction("missing"), /Test campaign not found/);
    assert.deepEqual(h.original, before);
    assert.deepEqual(h.publishCalls, []);
    assert.deepEqual(h.fundingCalls, []);
  });
}

test("SUPPORT cannot start or stop tests and performs no database or publish calls", async () => {
  const h = await harness("SUPPORT");
  h.campaigns.push({ id: "active-test", isTest: true, status: "ACTIVE" });
  const before = structuredClone(h.campaigns);
  await assert.rejects(h.actions.startTestAdAction(input), /Administrator access required/);
  await assert.rejects(h.actions.stopTestAdAction("active-test"), /Administrator access required/);
  assert.deepEqual(h.campaigns, before);
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.publishCalls, []);
  assert.deepEqual(h.fundingCalls, []);
});

test("the advertiser cannot be a tester even alongside valid testers", async () => {
  const h = await harness();
  const before = structuredClone(h.campaigns);
  await assert.rejects(h.actions.startTestAdAction({ ...input, testerUsernames: ["alice", "@owner"] }), /other than the advertiser/);
  assert.deepEqual(h.campaigns, before);
  assert.deepEqual(h.calls.map((call) => call.operation), ["find", "testers"]);
  assert.deepEqual(h.publishCalls, []);
  assert.deepEqual(h.fundingCalls, []);
});
