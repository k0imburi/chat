import { PrismaClient } from "@prisma/client"

if (process.env.ALLOW_TEST_CHAT_PURGE !== "YES") {
  throw new Error("Refusing to clear chats. Set ALLOW_TEST_CHAT_PURGE=YES to continue.")
}

const prisma = new PrismaClient()

try {
  const [messages, participants, threads] = await Promise.all([
    prisma.chatMessage.count(),
    prisma.chatParticipant.count(),
    prisma.chatThread.count(),
  ])

  await prisma.$transaction(async (tx) => {
    await tx.chatMessage.deleteMany()
    await tx.chatParticipant.deleteMany()
    await tx.chatThread.deleteMany()
  })

  console.log(
    `Cleared ${messages} messages, ${participants} participants, and ${threads} threads.`,
  )
} finally {
  await prisma.$disconnect()
}
