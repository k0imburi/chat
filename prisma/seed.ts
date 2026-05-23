import { PrismaClient, LoginProvider, MediaKind, NotificationChannel, NotificationStatus, PlanInterval, UserRole, UserStatus } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma: PrismaClient = new PrismaClient()

async function main() {
  const adminEmail = process.env.DEFAULT_ADMIN_EMAIL ?? "admin@chatandtip.com"
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD ?? "123456"
  const passwordHash = await bcrypt.hash(adminPassword, 12)

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

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      fullName: "Super Admin",
      gender: "",
    },
    create: {
      fullName: "Super Admin",
      email: adminEmail,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      gender: "",
    },
  })

  const activeAdmin = await prisma.user.findFirstOrThrow({
    where: { email: adminEmail },
  })

  const users = await Promise.all(
    [
      {
        fullName: "Amina Njeri",
        email: "amina@example.com",
        phoneNumber: "+254700123456",
        gender: "F",
        country: "Kenya",
        city: "Nairobi",
      status: UserStatus.ACTIVE,
        verified: true,
        loginProvider: LoginProvider.EMAIL,
      },
      {
        fullName: "Daniel Otieno",
        email: "daniel@example.com",
        phoneNumber: "+254700654321",
        gender: "M",
        country: "Kenya",
        city: "Kisumu",
      status: UserStatus.REPORTED,
        verified: false,
        loginProvider: LoginProvider.GOOGLE,
      },
      {
        fullName: "Grace Wanjiku",
        email: "grace@example.com",
        phoneNumber: "+254711000999",
        gender: "F",
        country: "Uganda",
        city: "Kampala",
      status: UserStatus.BLOCKED,
        verified: false,
        loginProvider: LoginProvider.PHONE,
      },
    ].map(async (user, index) => {
      const existing = await prisma.user.findFirst({
        where: {
          email: user.email,
          role: UserRole.USER,
        },
      })

      const data = {
        ...user,
        swipeCount: (index + 1) * 17,
        birthday: new Date(1996 + index, index + 1, 12),
        lastActiveAt: new Date(),
      }

      if (existing) {
        return prisma.user.update({
          where: { id: existing.id },
          data,
        })
      }

      return prisma.user.create({
        data: {
          ...data,
          role: UserRole.USER,
          isActive: true,
        },
      })
    })
  )

  await prisma.providerAccount.createMany({
    data: [
      {
        userId: users[1].id,
        provider: LoginProvider.GOOGLE,
        providerUserId: "seed-google-daniel",
        email: users[1].email,
      },
      {
        userId: users[2].id,
        provider: LoginProvider.PHONE,
        providerUserId: users[2].phoneNumber ?? "",
        email: users[2].email,
      },
    ].filter((account) => account.providerUserId),
    skipDuplicates: true,
  })

  await prisma.userMedia.createMany({
    data: users.flatMap((user, index) => [
      {
        userId: user.id,
        kind: MediaKind.PROFILE_VIDEO,
        url: `https://images.unsplash.com/photo-15${index + 10}000000000?auto=format&fit=crop&w=1200&q=80`,
        thumbnailUrl: `https://images.unsplash.com/photo-15${index + 10}000000000?auto=format&fit=crop&w=600&q=80`,
        views: 40 + index * 10,
      },
      {
        userId: user.id,
        kind: MediaKind.GALLERY_VIDEO,
        url: `https://samplelib.com/lib/preview/mp4/sample-5s.mp4`,
        thumbnailUrl: `https://images.unsplash.com/photo-15${index + 11}000000000?auto=format&fit=crop&w=600&q=80`,
        views: 12 + index * 4,
      },
    ]),
    skipDuplicates: true,
  })

  await prisma.report.createMany({
    data: [
      {
        reportedUserId: users[1].id,
        reportedById: users[0].id,
        message: "Repeated spam links in private messages.",
      },
      {
        reportedUserId: users[2].id,
        reportedById: users[1].id,
        message: "Profile content violated community standards.",
      },
    ],
    skipDuplicates: true,
  })

  await prisma.paymentPlan.createMany({
    data: [
      {
        name: "Starter",
        code: "starter-monthly",
        description: "Entry premium access for one month.",
        amount: 9.99,
        currency: "USD",
        interval: PlanInterval.MONTHLY,
        features: ["Unlimited swipes", "Profile boost"],
        sortOrder: 1,
      },
      {
        name: "VIP",
        code: "vip-quarterly",
        description: "Quarterly premium plan with visibility perks.",
        amount: 24.99,
        currency: "USD",
        interval: PlanInterval.MONTHLY,
        intervalCount: 3,
        features: ["Unlimited swipes", "Priority support", "Featured badge"],
        sortOrder: 2,
      },
    ],
    skipDuplicates: true,
  })

  const admin = activeAdmin

  await prisma.notificationCampaign.createMany({
    data: [
      {
        title: "Welcome back",
        message: "Your new admin panel is ready with MySQL and R2.",
        channel: NotificationChannel.IN_APP,
        status: NotificationStatus.SENT,
        sentAt: new Date(),
        createdById: admin.id,
      },
    ],
    skipDuplicates: true,
  })

  await prisma.userNotification.createMany({
    data: [
      {
        userId: users[0].id,
        senderId: users[1].id,
        title: "New like",
        message: "Daniel liked your latest profile video.",
        type: "like",
      },
      {
        userId: users[1].id,
        senderId: users[0].id,
        title: "Tip request",
        message: "Amina requested a tip response in chat.",
        type: "tip",
      },
    ],
    skipDuplicates: true,
  })
}

main()
  .catch(async (error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
