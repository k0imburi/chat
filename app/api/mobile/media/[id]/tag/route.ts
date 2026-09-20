import { TagApprovalStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getMobileSessionFromRequest } from "@/lib/mobile-session";
import { createUserNotification } from "@/lib/mobile-notifications";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  action: z.enum(["accept", "decline"]),
  notificationId: z.string().min(1).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getMobileSessionFromRequest(request);
  if (!session?.userId) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const { id } = await context.params;
    const { action, notificationId } = bodySchema.parse(await request.json());
    const media = await prisma.userMedia.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, username: true } },
      },
    });
    const taggedIds = Array.isArray(media?.taggedUserIds)
      ? media.taggedUserIds.map(String)
      : media?.taggedUserId
        ? [media.taggedUserId]
        : [];
    if (!media || !taggedIds.includes(session.userId)) {
      return NextResponse.json(
        { success: false, message: "Tag request not found" },
        { status: 404 },
      );
    }
    const statuses =
      media.tagApprovalStatuses &&
      typeof media.tagApprovalStatuses === "object" &&
      !Array.isArray(media.tagApprovalStatuses)
        ? { ...(media.tagApprovalStatuses as Record<string, string>) }
        : {
            [session.userId]:
              media.tagApprovalStatus ?? TagApprovalStatus.PENDING,
          };
    if (statuses[session.userId] !== TagApprovalStatus.PENDING) {
      return NextResponse.json(
        { success: false, message: "This tag has already been reviewed" },
        { status: 409 },
      );
    }

    const accepted = action === "accept";
    statuses[session.userId] = accepted
      ? TagApprovalStatus.ACCEPTED
      : TagApprovalStatus.DECLINED;
    const approvedIds = taggedIds.filter(
      (taggedId) => statuses[taggedId] === TagApprovalStatus.ACCEPTED,
    );
    const names = Array.isArray(media.taggedUsernames)
      ? media.taggedUsernames.map(String)
      : media.taggedUsername
        ? [media.taggedUsername]
        : [];
    await prisma.userMedia.update({
      where: { id },
      data: {
        tagApprovalStatuses: statuses,
        // Legacy readers still use this scalar field. It means at least one
        // recipient accepted, while modern clients filter by each status.
        tagApprovalStatus: approvedIds.length
          ? TagApprovalStatus.ACCEPTED
          : TagApprovalStatus.PENDING,
        taggedUserId: approvedIds[0] || media.taggedUserId || null,
        taggedUsername: approvedIds.length
          ? names[taggedIds.indexOf(approvedIds[0])] || null
          : media.taggedUsername,
      },
    });

    const recipientName = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { fullName: true, username: true },
    });
    const name =
      recipientName?.username || recipientName?.fullName || "Someone";
    const decisionMessage = accepted
      ? "You accepted this tag"
      : "You declined this tag";

    // The original request stays in Activity as a completed record instead of
    // showing stale buttons after the screen is reopened.
    if (notificationId) {
      await prisma.userNotification.updateMany({
        where: {
          id: notificationId,
          userId: session.userId,
          type: "post_tag",
        },
        data: { isRead: true, message: decisionMessage },
      });
    } else {
      await prisma.userNotification.updateMany({
        where: {
          userId: session.userId,
          type: "post_tag",
          metadata: { path: "$.mediaId", equals: media.id },
        },
        data: { isRead: true, message: decisionMessage },
      });
    }
    await createUserNotification({
      userId: media.userId,
      senderId: session.userId,
      type: "post_tag",
      title: name,
      message: accepted ? "accepted your post tag" : "declined your post tag",
      metadata: { mediaId: media.id, tagResponse: action },
    });

    return NextResponse.json({ success: true, accepted });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Unable to review tag",
      },
      { status: 400 },
    );
  }
}
