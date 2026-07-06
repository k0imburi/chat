import { PrismaClient, UserRole } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma: PrismaClient = new PrismaClient()

// Seed economy balances for a set of known test accounts.
// Does NOT touch users, media, or any other data.
const ECONOMY_ACCOUNTS = [
  "pablokahura",
  "koimburi",
  "lucyjoymwende",
  "joelm",
]

const ECONOMY_GRANT = {
  keys: 10,
  chatCredits: 50,
  voiceSessions: 5,
  videoSessions: 5,
  pebbles: 15,
  gems: 8,
  diamonds: 3,
}

async function main() {
  // ── Admin account ─────────────────────────────────────────────
  const adminEmail = process.env.DEFAULT_ADMIN_EMAIL ?? "admin@chatandtip.com"
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD ?? "123456"
  const passwordHash = await bcrypt.hash(adminPassword, 12)

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash, role: UserRole.SUPER_ADMIN, isActive: true },
    create: {
      fullName: "Super Admin",
      email: adminEmail,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      gender: "",
    },
  })
  console.log(`✓ Admin: ${adminEmail}`)

  // ── App settings (idempotent) ─────────────────────────────────
  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: {
      adminEmail,
      jwtExpiry: process.env.JWT_EXPIRES_IN ?? "7d",
      r2AccountId: process.env.R2_ACCOUNT_ID ?? "",
      r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
      r2BucketName: process.env.R2_BUCKET_NAME ?? "",
      r2PublicBaseUrl: process.env.R2_PUBLIC_BASE_URL ?? "",
      r2Region: process.env.R2_REGION ?? "auto",
      r2Endpoint: process.env.R2_ENDPOINT ?? "",
    },
    create: {
      id: 1,
      appName: "ChatAndTip",
      maxVideosUpload: 10,
      currency: "USD",
      adminEmail,
      jwtExpiry: process.env.JWT_EXPIRES_IN ?? "7d",
      r2AccountId: process.env.R2_ACCOUNT_ID ?? "",
      r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
      r2BucketName: process.env.R2_BUCKET_NAME ?? "",
      r2PublicBaseUrl: process.env.R2_PUBLIC_BASE_URL ?? "",
      r2Region: process.env.R2_REGION ?? "auto",
      r2Endpoint: process.env.R2_ENDPOINT ?? "",
    },
  })

  // ── Economy grants ────────────────────────────────────────────
  let granted = 0
  let skipped = 0

  for (const handle of ECONOMY_ACCOUNTS) {
    // Match by email containing the handle (case-insensitive)
    const user = await prisma.user.findFirst({
      where: { email: { contains: handle } },
    })

    if (!user) {
      console.log(`  ⚠ No user found matching "${handle}" — skipped`)
      skipped++
      continue
    }

    await prisma.creditAccount.upsert({
      where: { userId: user.id },
      update: ECONOMY_GRANT,
      create: { userId: user.id, ...ECONOMY_GRANT },
    })

    console.log(`  ✓ ${user.email} → ${ECONOMY_GRANT.keys} keys · ${ECONOMY_GRANT.chatCredits} chat credits · ${ECONOMY_GRANT.voiceSessions} voice · ${ECONOMY_GRANT.videoSessions} video · ${ECONOMY_GRANT.pebbles}P ${ECONOMY_GRANT.gems}G ${ECONOMY_GRANT.diamonds}D`)
    granted++
  }

  console.log(`\nDone: ${granted} account(s) updated, ${skipped} skipped`)
}

main()
  .catch(async (error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
