/**
 * Verifies the credits-economy ledger invariants against the live DB using
 * two seed example users. Self-cleaning: removes all rows it creates.
 *
 *   DATABASE_URL="<external-url>" npx tsx scripts/verify-credits.ts
 */
import { PrismaClient } from "@prisma/client"
import {
  allocateCredits,
  consumeCredit,
  getCreditBalances,
  getCreatorEarnings,
  recordTip,
  InsufficientCreditsError,
  ON_ACCOUNT_VALUE_KES,
} from "../lib/mobile-credits"

const prisma = new PrismaClient()

let pass = 0
let fail = 0
function check(label: string, cond: boolean) {
  if (cond) {
    pass++
    console.log(`  ✓ ${label}`)
  } else {
    fail++
    console.log(`  ✗ ${label}`)
  }
}

async function cleanup(userIds: string[]) {
  await prisma.creditLedger.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.creditLedger.deleteMany({ where: { counterpartyId: { in: userIds } } })
  await prisma.tip.deleteMany({ where: { OR: [{ senderId: { in: userIds } }, { receiverId: { in: userIds } }] } })
  await prisma.creditAccount.deleteMany({ where: { userId: { in: userIds } } })
}

async function main() {
  const users = await prisma.user.findMany({ where: { role: "USER" }, take: 2, orderBy: { createdAt: "asc" } })
  if (users.length < 2) throw new Error("Need at least 2 USER accounts to test.")
  const [payer, creator] = users
  console.log(`Payer: ${payer.fullName} | Creator: ${creator.fullName}\n`)

  await cleanup([payer.id, creator.id])

  const txn = "verify-credits-tx-1"

  // 1. Purchase allocates correct quantities.
  console.log("Purchase (1 Key + 5 ChatCredits):")
  let bal = await allocateCredits({ userId: payer.id, items: { KEY: 1, CHAT_CREDIT: 5 }, transactionId: txn })
  check("keys = 1", bal.keys === 1)
  check("chatCredits = 5", bal.chatCredits === 5)

  // 2. Idempotent purchase — replay must not double-credit.
  bal = await allocateCredits({ userId: payer.id, items: { KEY: 1, CHAT_CREDIT: 5 }, transactionId: txn })
  check("replay does not double-credit (keys still 1)", bal.keys === 1 && bal.chatCredits === 5)

  // 3. IceBreaker → consumes 1 Key, creator earns its value.
  console.log("\nConsume Key (IceBreaker unlock):")
  bal = await consumeCredit({ userId: payer.id, creatorId: creator.id, kind: "KEY", idempotencyKey: "msg-1" })
  check("keys = 0 after consume", bal.keys === 0)
  let earn = await getCreatorEarnings(creator.id)
  check(`creator earned ${ON_ACCOUNT_VALUE_KES.KEY} KES`, earn.KES === ON_ACCOUNT_VALUE_KES.KEY)

  // 4. Idempotent consume — same message id must not double-charge.
  bal = await consumeCredit({ userId: payer.id, creatorId: creator.id, kind: "KEY", idempotencyKey: "msg-1" })
  check("replay consume is a no-op (keys still 0)", bal.keys === 0)

  // 5. Subsequent reply → consumes 1 ChatCredit, creator earns more.
  console.log("\nConsume ChatCredit (subsequent reply):")
  bal = await consumeCredit({ userId: payer.id, creatorId: creator.id, kind: "CHAT_CREDIT", idempotencyKey: "msg-2" })
  check("chatCredits = 4", bal.chatCredits === 4)
  earn = await getCreatorEarnings(creator.id)
  check(
    `creator earned ${ON_ACCOUNT_VALUE_KES.KEY + ON_ACCOUNT_VALUE_KES.CHAT_CREDIT} KES total`,
    earn.KES === ON_ACCOUNT_VALUE_KES.KEY + ON_ACCOUNT_VALUE_KES.CHAT_CREDIT,
  )

  // 6. Insufficient balance throws the right error.
  console.log("\nInsufficient balance:")
  let threw = false
  try {
    await consumeCredit({ userId: payer.id, creatorId: creator.id, kind: "KEY", idempotencyKey: "msg-3" })
  } catch (e) {
    threw = e instanceof InsufficientCreditsError && e.message === "You have insufficient Balance"
  }
  check("consuming with 0 keys throws 'You have insufficient Balance'", threw)

  // 7. Tip routes 50% to creator in USD, never to user balance.
  console.log("\nTip (Gem $5):")
  await recordTip({ senderId: payer.id, receiverId: creator.id, tier: "GEM", transactionId: "verify-tip-1" })
  earn = await getCreatorEarnings(creator.id)
  check("creator earned 2.5 USD from tip", earn.USD === 2.5)
  const payerBal = await getCreditBalances(payer.id)
  check("tip did not touch payer credit balances", payerBal.keys === 0 && payerBal.chatCredits === 4)

  await cleanup([payer.id, creator.id])
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
