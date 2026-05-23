import "server-only"

import { Prisma, UserRole, UserStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { DEFAULT_PAGE_SIZE } from "@/lib/constants"

export async function getUsers(params: {
  query?: string
  filterBy?: string
  status?: string
  page?: number
  pageSize?: number
}) {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE
  const skip = (page - 1) * pageSize
  const query = params.query?.trim()

  const where: Prisma.UserWhereInput = {
    role: UserRole.USER,
  }

  if (params.status && params.status !== "ALL") {
    where.status = params.status as UserStatus
  }

  if (query && params.filterBy) {
    if (params.filterBy === "fullName") {
      where.fullName = { contains: query }
    } else if (params.filterBy === "email") {
      where.email = { contains: query }
    } else if (params.filterBy === "phoneNumber") {
      where.phoneNumber = { contains: query }
    } else if (params.filterBy === "country") {
      where.country = { contains: query }
    } else if (params.filterBy === "city") {
      where.city = { contains: query }
    } else {
      where.OR = [
        { fullName: { contains: query } },
        { email: { contains: query } },
        { phoneNumber: { contains: query } },
      ]
    }
  }

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        media: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ])

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function getReports({ query = "" }: { query?: string } = {}) {
  return prisma.report.findMany({
    where: query
      ? {
          OR: [
            { target: { fullName: { contains: query } } },
            { reporter: { fullName: { contains: query } } },
            { message: { contains: query } },
          ],
        }
      : undefined,
    include: {
      target: true,
      reporter: true,
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function getPaymentPlans() {
  return prisma.paymentPlan.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  })
}

export async function getNotificationCampaigns() {
  return prisma.notificationCampaign.findMany({
    include: { createdBy: true },
    orderBy: { createdAt: "desc" },
  })
}

export async function getSettingsBundle() {
  const [settings, adminUsers] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: 1 } }),
    prisma.user.findMany({
      where: { role: { in: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUPPORT] } },
      orderBy: { createdAt: "asc" },
    }),
  ])

  return { settings, adminUsers }
}
