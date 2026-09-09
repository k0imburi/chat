import "server-only"

import { TechnicalIssueStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export async function getTechnicalIssues(query = "") {
  const search = query.trim()
  return prisma.technicalIssue.findMany({
    where: search
      ? {
          OR: [
            { subject: { contains: search } },
            { description: { contains: search } },
            { user: { fullName: { contains: search } } },
            { user: { email: { contains: search } } },
          ],
        }
      : undefined,
    include: {
      user: { select: { id: true, fullName: true, username: true, email: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  })
}

export async function updateTechnicalIssueStatus(
  issueId: string,
  status: TechnicalIssueStatus,
) {
  return prisma.technicalIssue.update({
    where: { id: issueId },
    data: {
      status,
      resolvedAt: status === TechnicalIssueStatus.RESOLVED ? new Date() : null,
    },
  })
}
