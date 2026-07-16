import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    // The production DB is reached over Railway's TCP proxy, which adds
    // per-query latency. Prisma's default interactive-transaction budget
    // (maxWait 2s / timeout 5s) is too tight for that — multi-step writes
    // like sendMessage() were tipping just past 5s ("Transaction already
    // closed"), which silently dropped messages. Give transactions real
    // headroom; also covers the booking/payment reconcile cron jobs.
    transactionOptions: {
      maxWait: 8000,
      timeout: 20000,
    },
  })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}

// Transient DB errors seen over Railway's TCP proxy: dropped connections
// (P1017), can't-reach (P1001), and pool timeouts (P2024). An interactive
// transaction is atomic — a failed attempt rolls back fully — so retrying a
// wrapped operation can't partially apply or duplicate work.
const RETRYABLE_PRISMA_CODES = new Set(["P1017", "P1001", "P2024"])

function isRetryablePrismaError(error: unknown): boolean {
  const code = (error as { code?: string })?.code
  if (code && RETRYABLE_PRISMA_CODES.has(code)) return true
  const msg = error instanceof Error ? error.message : String(error)
  return /Server has closed the connection|Can't reach database server/i.test(msg)
}

/** Run `fn`, retrying a couple of times on transient connection errors. */
export async function withDbRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (!isRetryablePrismaError(error) || i === attempts - 1) throw error
      await new Promise((r) => setTimeout(r, 150 * (i + 1)))
    }
  }
  throw lastError
}
