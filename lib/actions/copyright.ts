"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireSessionUser } from "@/lib/auth"
import { resolveCopyright } from "@/lib/mobile-copyright"

export async function listCopyrightFlaggedAction() {
  await requireSessionUser()
  return prisma.userMedia.findMany({
    where: { copyrightStatus: { in: ["UNDER_REVIEW", "APPEALED"] } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      thumbnailUrl: true,
      url: true,
      copyrightStatus: true,
      updatedAt: true,
      user: { select: { id: true, fullName: true, username: true } },
    },
  })
}

export async function resolveCopyrightAction(
  mediaId: string,
  decision: "restore" | "remove",
) {
  await requireSessionUser()
  const result = await resolveCopyright(mediaId, decision)
  revalidatePath("/copyright")
  return result
}
