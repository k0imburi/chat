import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const handles = process.argv.slice(2).map((value) => value.trim()).filter(Boolean)

const grant = {
  keys: 10,
  chatCredits: 50,
  voiceSessions: 5,
  videoSessions: 5,
  pebbles: 15,
  gems: 8,
  diamonds: 3,
}

async function main() {
  if (handles.length === 0) {
    throw new Error("Provide at least one username or email handle.")
  }

  for (const handle of handles) {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: handle } },
          { email: { contains: handle } },
          { fullName: { contains: handle } },
        ],
      },
      select: { id: true, username: true, email: true },
    })

    if (!user) {
      console.log(`SKIPPED ${handle}: no matching account`)
      continue
    }

    await prisma.creditAccount.upsert({
      where: { userId: user.id },
      update: grant,
      create: { userId: user.id, ...grant },
    })

    console.log(
      `SEEDED ${handle}: ${user.username ?? "no username"} <${user.email}>`,
    )
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
