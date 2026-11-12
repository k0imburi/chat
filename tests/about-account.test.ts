import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";

async function harness(viewer: string | null, account: unknown) {
  const queries: any[] = [];
  const mocks = {
    session: async () => viewer ? { userId: viewer } : null,
    prisma: { user: { findFirst: async (query: any) => { queries.push(query); return account; } } },
  };
  const result = await build({
    entryPoints: ['app/api/mobile/users/[id]/about/route.ts'], bundle: true,
    write: false, platform: 'node', format: 'cjs', packages: 'external',
    plugins: [{ name: 'boundaries', setup(b) {
      b.onResolve({ filter: /^@\/lib\// }, ({ path }) => ({ path, namespace: 'mock' }));
      b.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ contents:
        path.endsWith('prisma') ? 'export const prisma = __mocks.prisma;' :
        path.endsWith('mobile-session') ? 'export const getMobileSessionFromRequest = __mocks.session;' :
        'export const logError = () => {};',
      }));
    } }],
  });
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', '__mocks', result.outputFiles[0].text)(
    createRequire(`${process.cwd()}/package.json`), module, module.exports, mocks);
  return { get: (id: string) => module.exports.GET(new Request('https://example.com/about'), { params: Promise.resolve({ id }) }), queries };
}

test('about account exposes only account metadata and real recorded totals', async () => {
  const h = await harness('viewer', { createdAt: new Date('2020-01-02Z'), verified: true,
    nameChangeCount: 2, lastNameChangedAt: new Date('2026-10-09Z'), nameHistoryStartedAt: new Date('2026-10-08Z') });
  const response = await h.get('profile');
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.deepEqual(Object.keys(data).sort(), ['dateJoined', 'verified', 'nameChangeCount', 'lastNameChangedAt', 'nameHistoryStartedAt'].sort());
  assert.equal(data.nameChangeCount, 2);
  assert.equal(data.verified, true);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(h.queries[0].where.isActive, true);
  assert.deepEqual(h.queries[0].where.status.notIn, ['BLOCKED', 'HIDDEN']);
});

test('anonymous aliases and logged-out requests cannot access account metadata', async () => {
  for (const [viewer, id, status] of [['viewer', 'anon_private', 404], [null, 'profile', 401]] as const) {
    const h = await harness(viewer, {});
    assert.equal((await h.get(id)).status, status);
    assert.equal(h.queries.length, 0);
  }
});

test('missing or unavailable profiles return not found', async () => {
  const h = await harness('viewer', null);
  assert.equal((await h.get('missing')).status, 404);
});
