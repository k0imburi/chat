import "server-only"

import { UserRole } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export async function getMobileAppInfo() {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } })

  return {
    maxVideosUpload: settings?.maxVideosUpload ?? 10,
    freeMemberSwipeLimit: settings?.freeMemberSwipeLimit ?? 20,
    showDiscoverAdAfterXswipes: settings?.showDiscoverAdAfterSwipes ?? 20,
    allowVideoModeration: settings?.allowVideoModeration ?? false,
    showAds: settings?.showAds ?? false,
    allowFreeAccess: settings?.allowFreeAccess ?? false,
    allowVideoCall: settings?.allowVideoCall ?? true,
    allowVoiceCall: settings?.allowVoiceCall ?? true,
    allowSendImages: settings?.allowSendImages ?? true,
    totalVideos: await prisma.userMedia.count(),
    userStats: {
      totalUsers: await prisma.user.count({ where: { role: UserRole.USER } }),
      blockedUsers: await prisma.user.count({ where: { role: UserRole.USER, status: "BLOCKED" } }),
      reportedUsers: await prisma.user.count({ where: { role: UserRole.USER, status: "REPORTED" } }),
    },
    countryStats: {},
    maleStats: {},
    femaleStats: {},
    platformStats: {},
    appName: settings?.appName ?? "ChatAndTip",
    email: settings?.contactEmail ?? "",
    phone: settings?.contactPhone ?? "",
    address: settings?.address ?? "",
    currency: settings?.currency ?? "USD",
    minimumTip: Number(settings?.minimumTip ?? 0),
    transactionFee: Number(settings?.transactionFeePercent ?? 0),
    usdToKesRate: Number(settings?.usdToKesRate ?? 0),
    paypalClientId: settings?.paypalClientId ?? "",
    paypalClientSecret: settings?.paypalClientSecret ?? "",
  }
}
