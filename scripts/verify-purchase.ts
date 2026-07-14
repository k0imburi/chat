/**
 * Verifies credit-purchase pricing + allocate-on-callback. Self-cleaning.
 *   DATABASE_URL="<external-url>" npx tsx scripts/verify-purchase.ts
 */
import { PrismaClient, Prisma } from "@prisma/client"
import { priceCart, getCreditBalances } from "../lib/mobile-credits"
import { fulfillVerifiedCreditAttempt, markAttemptFailed } from "../lib/payment-attempts"

const prisma = new PrismaClient()
let pass = 0, fail = 0
const check = (l: string, c: boolean) => {
  if (c) pass++
  else fail++
  console.log(`  ${c ? "✓" : "✗"} ${l}`)
}

async function cleanup(userId: string) {
  await prisma.creditPurchase.deleteMany({ where: { userId } })
  await prisma.paymentAttempt.deleteMany({ where: { userId } })
  await prisma.creditLedger.deleteMany({ where: { userId } })
  await prisma.creditAccount.deleteMany({ where: { userId } })
}

async function main() {
  const user = await prisma.user.findFirst({ where: { role: "USER" }, orderBy: { createdAt: "asc" } })
  if (!user) throw new Error("No USER account")
  await cleanup(user.id)

  // 1. Pricing (USD base x exchange rate; using rate 130 for these checks)
  console.log("priceCart:")
  check("1 Key + 5 ChatCredits = 260 KES @ rate 130", priceCart({ KEY: 1, CHAT_CREDIT: 5 }, 130).totalKes === 260)
  check("1 VoiceCall session = 520 KES @ rate 130", priceCart({ VOICE_SESSION: 1 }, 130).totalKes === 520)
  let threw = false
  try { priceCart({ KEY: 1, CHAT_CREDIT: 2 }, 130) } catch { threw = true }
  check("below min ChatCredits throws", threw)

  // 2. Allocate on successful callback
  console.log("\nfinalize (success):")
  const co = "verify-purchase-co-1"
  const attempt = await prisma.paymentAttempt.create({
    data: {
      userId: user.id,
      provider: "MPESA",
      purpose: "CREDIT_PURCHASE",
      status: "VERIFYING",
      amount: new Prisma.Decimal(340),
      currency: "KES",
      idempotencyKey: "verify-purchase-attempt-1",
      checkoutRequestId: co,
      providerReceipt: "VERIFYRECEIPT1",
      verifiedAt: new Date(),
    },
  })
  const purchase = await prisma.creditPurchase.create({
    data: {
      userId: user.id,
      checkoutRequestId: co,
      phone: "254700000000",
      items: { KEY: 2, CHAT_CREDIT: 5 },
      totalKes: new Prisma.Decimal(340),
      status: "PENDING",
      paymentAttemptId: attempt.id,
    },
  })
  await fulfillVerifiedCreditAttempt(attempt.id)
  let bal = await getCreditBalances(user.id)
  check("keys allocated = 2", bal.keys === 2)
  check("chatCredits allocated = 5", bal.chatCredits === 5)
  const after = await prisma.creditPurchase.findUnique({ where: { id: purchase.id } })
  check("purchase marked SUCCESS + allocated", after?.status === "SUCCESS" && after?.allocated === true)

  // 3. Idempotent re-delivery
  await fulfillVerifiedCreditAttempt(attempt.id)
  bal = await getCreditBalances(user.id)
  check("re-delivered callback does not double-allocate", bal.keys === 2 && bal.chatCredits === 5)

  // 4. Failed callback
  console.log("\nfinalize (failure):")
  const co2 = "verify-purchase-co-2"
  const attempt2 = await prisma.paymentAttempt.create({
    data: {
      userId: user.id,
      provider: "MPESA",
      purpose: "CREDIT_PURCHASE",
      status: "PENDING",
      amount: new Prisma.Decimal(450),
      currency: "KES",
      idempotencyKey: "verify-purchase-attempt-2",
      checkoutRequestId: co2,
    },
  })
  await prisma.creditPurchase.create({
    data: {
      userId: user.id,
      checkoutRequestId: co2,
      phone: "254700000000",
      items: { VOICE_SESSION: 1 },
      totalKes: new Prisma.Decimal(450),
      status: "PENDING",
      paymentAttemptId: attempt2.id,
    },
  })
  await markAttemptFailed(attempt2.id, "Payment failed", 1)
  bal = await getCreditBalances(user.id)
  const failed = await prisma.creditPurchase.findUnique({ where: { checkoutRequestId: co2 } })
  check("failed callback does not allocate", bal.voiceSessions === 0 && failed?.status === "FAILED")

  await cleanup(user.id)
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1) }).finally(() => prisma.$disconnect())
