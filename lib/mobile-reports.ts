import "server-only"

import { prisma } from "@/lib/prisma"

/**
 * Report a specific post. Unlike reporting an account, this doesn't touch
 * the creator's status — it just hides this one piece of content from
 * everyone except its owner (same mechanism as copyright takedowns) while
 * an admin reviews the report.
 */
export async function reportMedia(input: { reporterId: string; mediaId: string; message: string }) {
  const media = await prisma.userMedia.findUnique({
    where: { id: input.mediaId },
    select: { id: true, userId: true },
  })
  if (!media) throw new Error("Post not found")
  if (media.userId === input.reporterId) throw new Error("You can't report your own post")

  await prisma.$transaction([
    prisma.report.create({
      data: {
        message: input.message,
        reportedUserId: media.userId,
        reportedById: input.reporterId,
        mediaId: input.mediaId,
      },
    }),
    prisma.userMedia.update({
      where: { id: input.mediaId },
      data: { reportStatus: "UNDER_REVIEW" },
    }),
  ])
}

/** Report an account (not tied to a specific post) — flags it for admin review. */
export async function reportUserAccount(input: { reporterId: string; reportedUserId: string; message: string }) {
  await prisma.$transaction([
    prisma.report.create({
      data: {
        message: input.message,
        reportedUserId: input.reportedUserId,
        reportedById: input.reporterId,
      },
    }),
    prisma.user.update({
      where: { id: input.reportedUserId },
      data: { status: "REPORTED" },
    }),
  ])
}
