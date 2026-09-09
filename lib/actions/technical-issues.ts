"use server"

import { revalidatePath } from "next/cache"
import { TechnicalIssueStatus } from "@prisma/client"
import { requireSessionUser } from "@/lib/auth"
import { getTechnicalIssues, updateTechnicalIssueStatus } from "@/lib/technical-issues"

export async function queryTechnicalIssuesAction(query: string) {
  await requireSessionUser()
  return getTechnicalIssues(query)
}

export async function updateTechnicalIssueStatusAction(
  issueId: string,
  status: TechnicalIssueStatus,
) {
  await requireSessionUser()
  await updateTechnicalIssueStatus(issueId, status)
  revalidatePath("/technical-problems")
}
