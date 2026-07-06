/**
 * Destructive chat reset for test databases only.
 *
 * Usage:
 *   RESET_CHATS_CONFIRM=drop-all-chats DATABASE_URL="mysql://..." node scripts/reset-chats.mjs
 *
 * This clears chat threads/messages/participants and message/broadcast
 * notifications. It intentionally does not touch payments, credit balances,
 * credit ledger rows, earning lots, users, media, or admin broadcasts history.
 */
import { PrismaClient } from "@prisma/client"

const CONFIRMATION = "drop-all-chats"

if (process.env.RESET_CHATS_CONFIRM !== CONFIRMATION) {
  console.error(`Refusing to reset chats. Set RESET_CHATS_CONFIRM=${CONFIRMATION} to continue.`)
  process.exit(1)
}

const prisma = new PrismaClient()

async function main() {
  const [messagesBefore, participantsBefore, threadsBefore, notificationsBefore] = await Promise.all([
    prisma.chatMessage.count(),
    prisma.chatParticipant.count(),
    prisma.chatThread.count(),
    prisma.userNotification.count({ where: { type: { in: ["message", "broadcast"] } } }),
  ])

  await prisma.$transaction([
    prisma.userNotification.deleteMany({ where: { type: { in: ["message", "broadcast"] } } }),
    prisma.chatMessage.deleteMany(),
    prisma.chatParticipant.deleteMany(),
    prisma.chatThread.deleteMany(),
  ])

  console.log("Chat reset complete:")
  console.log(`  chat messages deleted: ${messagesBefore}`)
  console.log(`  chat participants deleted: ${participantsBefore}`)
  console.log(`  chat threads deleted: ${threadsBefore}`)
  console.log(`  chat notifications deleted: ${notificationsBefore}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
