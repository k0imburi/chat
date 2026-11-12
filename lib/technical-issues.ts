import "server-only"

import { TechnicalIssueStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireSupportAdmin } from "@/lib/support-admin"

export async function getTechnicalIssues(query = "", queue: "technical" | "support" = "technical") {
  await requireSupportAdmin()
  const search = query.trim()
  return prisma.technicalIssue.findMany({
    where: {
      subject: queue === "support"
        ? { startsWith: "Support chat · C#" }
        : { not: { startsWith: "Support chat · C#" } },
      ...(search ? {
          OR: [
            { subject: { contains: search } },
            { description: { contains: search } },
            { user: { fullName: { contains: search } } },
            { user: { email: { contains: search } } },
          ],
        } : {}),
    },
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
  await requireSupportAdmin()
  return prisma.technicalIssue.update({
    where: { id: issueId },
    data: {
      status,
      resolvedAt: status === TechnicalIssueStatus.RESOLVED ? new Date() : null,
    },
  })
}
