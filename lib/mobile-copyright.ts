import "server-only"

import { prisma } from "@/lib/prisma"
import { createUserNotification } from "@/lib/mobile-notifications"

// A copyright report hides the post from everyone except its owner and puts it
// under review. The owner is alerted and can appeal; an admin then decides.
export async function reportCopyright(reporterId: string, mediaId: string) {
  const media = await prisma.userMedia.findUnique({
    where: { id: mediaId },
    select: { id: true, userId: true, copyrightStatus: true, title: true },
  })
  if (!media) throw new Error("Post not found")
  if (media.userId === reporterId) throw new Error("You cannot report your own post")

  // Only flag if not already under review/removed (idempotent).
  if (!media.copyrightStatus) {
    await prisma.userMedia.update({
      where: { id: mediaId },
      data: { copyrightStatus: "UNDER_REVIEW" },
    })
    await prisma.report.create({
      data: {
        reportedUserId: media.userId,
        reportedById: reporterId,
        message: `Copyright report on media ${mediaId}`,
      },
    })
    // Alert the owner so they can appeal.
    await createUserNotification({
      userId: media.userId,
      title: "Post under review",
      message:
        "Your post was reported for copyright and is hidden while under review. Open it to appeal.",
      type: "alert",
      metadata: { videoId: mediaId, copyright: "UNDER_REVIEW" },
    })
  }
  return { status: "UNDER_REVIEW" as const }
}

export async function appealCopyright(ownerId: string, mediaId: string) {
  const media = await prisma.userMedia.findUnique({
    where: { id: mediaId },
    select: { userId: true, copyrightStatus: true },
  })
  if (!media) throw new Error("Post not found")
  if (media.userId !== ownerId) throw new Error("Only the owner can appeal")
  if (media.copyrightStatus !== "UNDER_REVIEW") {
    throw new Error("This post is not awaiting an appeal")
  }
  await prisma.userMedia.update({
    where: { id: mediaId },
    data: { copyrightStatus: "APPEALED" },
  })
  return { status: "APPEALED" as const }
}

// Admin decision: "restore" clears the flag (visible again); "remove" keeps it
// permanently hidden.
export async function resolveCopyright(
  mediaId: string,
  decision: "restore" | "remove",
) {
  const media = await prisma.userMedia.findUnique({
    where: { id: mediaId },
    select: { userId: true },
  })
  if (!media) throw new Error("Post not found")
  await prisma.userMedia.update({
    where: { id: mediaId },
    data: { copyrightStatus: decision === "restore" ? null : "REMOVED" },
  })
  await createUserNotification({
    userId: media.userId,
    title: decision === "restore" ? "Post restored" : "Post removed",
    message: decision === "restore"
      ? "Your appealed post passed review and is visible again."
      : "Your post was removed after a copyright review.",
    type: "alert",
    metadata: { videoId: mediaId, copyright: decision === "restore" ? "RESTORED" : "REMOVED" },
  })
  return { status: decision === "restore" ? "RESTORED" : "REMOVED" }
}
