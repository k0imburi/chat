import "server-only"

import { MediaKind, UserRole, UserStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export async function getDashboardData() {
  const [settings, users, reportsCount, mediaCount, paymentPlans, notifications] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: 1 } }),
    prisma.user.findMany({
      where: { role: UserRole.USER },
      include: { media: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.report.count(),
    prisma.userMedia.count({
      where: { kind: { in: [MediaKind.PROFILE_VIDEO, MediaKind.GALLERY_VIDEO] } },
    }),
    prisma.paymentPlan.count(),
    prisma.notificationCampaign.count(),
  ])

  const totalUsers = users.length
  const reportedUsers = users.filter((user) => user.status === UserStatus.REPORTED).length
  const blockedUsers = users.filter((user) => user.status === UserStatus.BLOCKED).length
  const activeUsers = users.filter((user) => user.status === UserStatus.ACTIVE).length

  const genderMap = users.reduce<Record<string, number>>((acc, user) => {
    const key = user.gender || "Unknown"
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  const countryMap = users.reduce<Record<string, number>>((acc, user) => {
    const key = user.country || "Unknown"
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  const platformMap = users.reduce<Record<string, number>>((acc, user) => {
    const key = user.deviceSystem || "Unknown"
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  // Monthly registrations — last 12 months
  const now = new Date()
  const monthlyGrowth: { month: string; users: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    const count = users.filter((u) => u.createdAt >= d && u.createdAt < next).length
    monthlyGrowth.push({
      month: d.toLocaleString("en-US", { month: "short", year: "2-digit" }),
      users: count,
    })
  }

  // New users this month vs last month
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const newUsersThisMonth = users.filter((u) => u.createdAt >= thisMonthStart).length
  const newUsersLastMonth = users.filter((u) => u.createdAt >= lastMonthStart && u.createdAt < thisMonthStart).length

  return {
    settings,
    totals: {
      totalUsers,
      reportedUsers,
      blockedUsers,
      activeUsers,
      reportsCount,
      mediaCount,
      paymentPlans,
      notifications,
      hiddenUsers: users.filter((user) => user.status === "HIDDEN").length,
      verifiedUsers: users.filter((user) => user.verified).length,
      femaleUsers: users.filter((user) => user.gender?.toUpperCase() === "F").length,
      maleUsers: users.filter((user) => user.gender?.toUpperCase() === "M").length,
      newUsersThisMonth,
      newUsersLastMonth,
    },
    monthlyGrowth,
    genderStats: Object.entries(genderMap).map(([name, value]) => ({ name, value })),
    countryStats: Object.entries(countryMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8),
    platformStats: Object.entries(platformMap).map(([name, value]) => ({ name, value })),
    newestUsers: users.slice(0, 8),
  }
}
