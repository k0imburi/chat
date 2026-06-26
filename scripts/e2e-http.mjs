// Live HTTP E2E against the running dev server (port 3006).
//   DATABASE_URL=... JWT_SECRET=... BASE=http://localhost:3006 node scripts/e2e-http.mjs
import { PrismaClient } from "@prisma/client"
import { SignJWT } from "jose"

const BASE = process.env.BASE || "http://localhost:3006"
const prisma = new PrismaClient()
const secret = new TextEncoder().encode(process.env.JWT_SECRET)

let pass = 0, fail = 0
const ok = (l, c, extra = "") => { c ? pass++ : fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${extra ? ` — ${extra}` : ""}`) }

const mint = (userId) =>
  new SignJWT({ userId, loginProvider: "EMAIL" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret)

async function main() {
  const [daniel, grace] = await prisma.user.findMany({
    where: { role: "USER" }, take: 2, orderBy: { createdAt: "asc" },
  })
  const token = await mint(daniel.id)
  const auth = { Authorization: `Bearer ${token}` }

  // ── 1. Balances endpoint ────────────────────────────────────────
  console.log("GET /api/mobile/credits:")
  let r = await fetch(`${BASE}/api/mobile/credits`, { headers: auth }).then((x) => x.json())
  ok("returns balances + pricing", r.success && r.data?.balances && r.data?.pricing?.purchaseKes?.KEY === 120)

  // ── 2. Checkout link (mint) ─────────────────────────────────────
  console.log("\nGET /api/mobile/credits/checkout-link:")
  r = await fetch(`${BASE}/api/mobile/credits/checkout-link`, { headers: auth }).then((x) => x.json())
  const url = r.data?.url || ""
  const checkoutToken = new URL(url).searchParams.get("t") || ""
  ok("returns a /checkout url with a token", r.success && url.includes("/checkout?t=") && checkoutToken.length > 20)

  // ── 3. Checkout info (token-authed) ─────────────────────────────
  console.log("\nGET /api/checkout/info?t=:")
  r = await fetch(`${BASE}/api/checkout/info?t=${encodeURIComponent(checkoutToken)}`).then((x) => x.json())
  ok("returns user + pricing for the token", r.success && r.data?.pricing?.purchaseKes?.CHAT_CREDIT === 20)
  console.log("\nGET /api/checkout/info with bad token:")
  r = await fetch(`${BASE}/api/checkout/info?t=garbage`).then((x) => ({ status: x.status }))
  ok("rejects an invalid token (401)", r.status === 401)

  // ── 4. Checkout page renders ────────────────────────────────────
  console.log("\nGET /checkout page:")
  const html = await fetch(`${BASE}/checkout?t=${encodeURIComponent(checkoutToken)}`)
  const body = await html.text()
  ok("page loads (200, not redirected to /login)", html.status === 200 && body.includes("ChatAndTip"))

  // ── 5. GATING: the real unlock path ─────────────────────────────
  console.log("\nUnlock flow (real /unlock endpoint):")
  // Seed: Daniel is the thread initiator; Grace replies (locked). Daniel holds
  // exactly 1 Key + 1 ChatCredit so we can exercise Key → ChatCredit → empty.
  const thread = await prisma.chatThread.create({
    data: {
      initiatorId: daniel.id,
      icebreakerUnlocked: false,
      participants: { create: [
        { userId: daniel.id, otherUserId: grace.id },
        { userId: grace.id, otherUserId: daniel.id },
      ] },
    },
  })
  const mkReply = (text) => prisma.chatMessage.create({
    data: { threadId: thread.id, senderId: grace.id, type: "TEXT", text, locked: true, reactions: {} },
  })
  const m1 = await mkReply("first reply")
  const m2 = await mkReply("second reply")
  const m3 = await mkReply("third reply")
  await prisma.creditAccount.upsert({
    where: { userId: daniel.id },
    create: { userId: daniel.id, keys: 1, chatCredits: 1 },
    update: { keys: 1, chatCredits: 1 },
  })

  const unlock = (mid) =>
    fetch(`${BASE}/api/mobile/chats/${grace.id}/messages/${mid}/unlock`, { method: "POST", headers: auth })

  // First unlock → spends the Key
  let res = await unlock(m1.id)
  let j = await res.json()
  ok("1st unlock 200 + message no longer locked", res.status === 200 && j.data?.message?.locked === false)
  let acct = await prisma.creditAccount.findUnique({ where: { userId: daniel.id } })
  ok("Key consumed (keys 1→0)", acct.keys === 0, `keys=${acct.keys}`)
  let th = await prisma.chatThread.findUnique({ where: { id: thread.id } })
  ok("thread icebreakerUnlocked flipped true", th.icebreakerUnlocked === true)

  // Second unlock → spends a ChatCredit
  res = await unlock(m2.id); j = await res.json()
  acct = await prisma.creditAccount.findUnique({ where: { userId: daniel.id } })
  ok("2nd unlock spends a ChatCredit (1→0)", res.status === 200 && acct.chatCredits === 0, `chat=${acct.chatCredits}`)

  // Third unlock → no balance → 402 insufficient
  res = await unlock(m3.id); j = await res.json()
  ok("3rd unlock blocked with 402 INSUFFICIENT_BALANCE", res.status === 402 && j.code === "INSUFFICIENT_BALANCE", `status=${res.status}`)
  const m3now = await prisma.chatMessage.findUnique({ where: { id: m3.id } })
  ok("blocked reply stays locked", m3now.locked === true)

  // Creator (Grace) earned the transferred value (80 + 10 KES)
  const earn = await prisma.creditLedger.aggregate({
    where: { userId: grace.id, entryType: "CREATOR_EARN", currency: "KES" },
    _sum: { value: true },
  })
  ok("Grace earned 90 KES (80 Key + 10 ChatCredit)", Number(earn._sum.value) === 90, `earned=${earn._sum.value}`)

  // ── cleanup ─────────────────────────────────────────────────────
  await prisma.chatThread.delete({ where: { id: thread.id } })
  await prisma.creditLedger.deleteMany({ where: { OR: [{ userId: daniel.id }, { userId: grace.id }, { counterpartyId: daniel.id }, { counterpartyId: grace.id }] } })
  await prisma.creditAccount.deleteMany({ where: { userId: { in: [daniel.id, grace.id] } } })

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1) }).finally(() => prisma.$disconnect())
