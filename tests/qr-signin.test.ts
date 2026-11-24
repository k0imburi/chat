import { test } from "node:test"
import assert from "node:assert/strict"
import { qrHash, qrMatches, qrSecret } from "../lib/qr-signin"
test("QR approval and polling use separate high-entropy secrets", () => {
  const poll = qrSecret(), approval = qrSecret()
  assert.notEqual(poll, approval)
  assert.ok(poll.length >= 40)
  assert.ok(qrMatches(poll, qrHash(poll)))
  assert.equal(qrMatches(approval, qrHash(poll)), false)
  assert.equal(qrMatches(poll, "invalid"), false)
})

import { createRequire } from "node:module"
import { build } from "esbuild"

async function loadRoute(entry: string, mocks: unknown) {
  const compiled = await build({ entryPoints: [entry], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [{
    name: "qr-test-boundaries", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/(prisma|mobile-session)$/ }, ({ path }) => ({ path, namespace: "mock" }))
      builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: path.endsWith("prisma") ? "export const prisma = __mocks.prisma" : "export const getMobileSessionFromRequest = __mocks.auth; export const signMobileSessionToken = __mocks.sign;" }))
    },
  }] })
  const module = { exports: {} as any }
  new Function("require", "module", "exports", "__mocks", compiled.outputFiles[0].text)(createRequire(`${process.cwd()}/package.json`), module, module.exports, mocks)
  return module.exports
}

test("QR approval requires authentication and the poll secret can be used only once", async () => {
  const poll = qrSecret(), approval = qrSecret()
  const row = { id: "challenge", pollHash: qrHash(poll), approvalHash: qrHash(approval), approvedUserId: null as string | null, consumedAt: null as Date | null, expiresAt: new Date(Date.now() + 60000) }
  let signedIn = false
  const mocks = {
    auth: async () => signedIn ? { userId: "user" } : null,
    sign: async () => "signed-session",
    prisma: {
      qrSignInChallenge: {
        findUnique: async () => ({ ...row }),
        updateMany: async ({ where, data }: any) => {
          if (row.consumedAt || row.expiresAt <= new Date()) return { count: 0 }
          if (where.approvedUserId === null && row.approvedUserId !== null) return { count: 0 }
          if (typeof where.approvedUserId === "string" && row.approvedUserId !== where.approvedUserId) return { count: 0 }
          Object.assign(row, data); return { count: 1 }
        },
      },
      user: { findUnique: async () => ({ id: "user", isActive: true, status: "ACTIVE", deactivatedAt: null, accountPurgedAt: null, email: null, phoneNumber: null, loginProvider: "EMAIL" }) },
    },
  }
  const approve = await loadRoute("app/api/mobile/auth/qr/approve/route.ts", mocks)
  const check = await loadRoute("app/api/mobile/auth/qr/poll/route.ts", mocks)
  const request = (path: string, data: unknown) => new Request(`https://chatandtip.com/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
  assert.equal((await approve.POST(request("approve", { id: row.id, approval }))).status, 401)
  signedIn = true
  assert.equal((await approve.POST(request("approve", { id: row.id, approval: poll }))).status, 404)
  assert.equal((await approve.POST(request("approve", { id: row.id, approval }))).status, 200)
  assert.equal((await check.POST(request("poll", { id: row.id, poll: approval }))).status, 404)
  const result = await check.POST(request("poll", { id: row.id, poll }))
  assert.equal((await result.json()).token, "signed-session")
  assert.equal((await check.POST(request("poll", { id: row.id, poll }))).status, 410)
})
