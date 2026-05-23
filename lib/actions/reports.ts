"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSessionUser } from "@/lib/auth"
import { getReports } from "@/lib/queries"

const schema = z.object({
  reportId: z.string().min(1),
})

export async function deleteReportAction(formData: FormData) {
  await requireSessionUser()
  const { reportId } = schema.parse({ reportId: formData.get("reportId") })
  await prisma.report.delete({ where: { id: reportId } })
  revalidatePath("/reports")
  revalidatePath("/dashboard")
}

export async function queryReportsAction(query: string) {
  await requireSessionUser()
  return getReports({ query })
}

export async function deleteReportByIdAction(reportId: string) {
  await requireSessionUser()
  await prisma.report.delete({ where: { id: reportId } })
  revalidatePath("/dashboard")
}
