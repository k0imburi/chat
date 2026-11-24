import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

async function routeFor(mocks: unknown) {
  const out = await build({ entryPoints: ['app/api/admin/sign-in-providers/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'mock-boundaries', setup(b) {
    b.onResolve({ filter: /^@\/lib\/(auth|prisma)$/ }, a => ({ path: a.path, namespace: 'stub' }))
    b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: a.path.endsWith('/auth') ? 'export const getSessionUser=__m.auth' : 'export const prisma=__m.prisma' }))
  } }] })
  const module = { exports: {} as any }
  new Function('require', 'module', 'exports', '__m', out.outputFiles[0].text)(createRequire(`${process.cwd()}/package.json`), module, module.exports, mocks)
  return module.exports
}

test('provider save enforces origin and role, validates inputs, and avoids writes for unchanged values', async () => {
  let role = 'SUPER_ADMIN', writes = 0
  const current = { googleOAuthClientIds: '123-abc.apps.googleusercontent.com', appleOAuthAudiences: 'com.example.web' }
  const route = await routeFor({ auth: async () => ({ role }), prisma: { appSettings: { findUnique: async () => current, upsert: async () => { writes++ } } } })
  const req = (body: unknown, origin = 'https://admin.chatandtip.com') => new Request('https://admin.chatandtip.com/api/admin/sign-in-providers', { method: 'POST', headers: { host: 'admin.chatandtip.com', origin, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  assert.equal((await route.POST(req(current, 'https://elsewhere.example'))).status, 403)
  role = 'ADMIN'; assert.equal((await route.POST(req(current))).status, 403)
  role = 'SUPER_ADMIN'; assert.equal((await route.POST(req({ ...current, googleOAuthClientIds: 'invalid' }))).status, 400)
  const unchanged = await route.POST(req(current)); assert.equal(unchanged.status, 200); assert.equal((await unchanged.json()).unchanged, true); assert.equal(writes, 0)
  assert.equal((await route.POST(req({ ...current, appleOAuthAudiences: 'com.example.changed' }))).status, 200); assert.equal(writes, 1)
})
