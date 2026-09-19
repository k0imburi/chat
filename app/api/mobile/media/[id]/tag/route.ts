import { Prisma, TagApprovalStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getMobileSessionFromRequest } from "@/lib/mobile-session";
import { createUserNotification } from "@/lib/mobile-notifications";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({ action: z.enum(["accept", "decline"]) });

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
    const { action } = bodySchema.parse(await request.json());
    const media = await prisma.userMedia.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, username: true } },
      },
    });
    if (!media || media.taggedUserId !== session.userId) {
      return NextResponse.json(
        { success: false, message: "Tag request not found" },
        { status: 404 },
      );
    }
    if (media.tagApprovalStatus !== TagApprovalStatus.PENDING) {
      return NextResponse.json(
        { success: false, message: "This tag has already been reviewed" },
        { status: 409 },
      );
    }

    const accepted = action === "accept";
    await prisma.userMedia.update({
      where: { id },
      data: accepted
        ? { tagApprovalStatus: TagApprovalStatus.ACCEPTED }
        : {
            tagApprovalStatus: TagApprovalStatus.DECLINED,
            taggedUserId: null,
            taggedUsername: null,
            taggedUserIds: Prisma.DbNull,
            taggedUsernames: Prisma.DbNull,
          },
    });

    const recipientName = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { fullName: true, username: true },
    });
    const name =
      recipientName?.username || recipientName?.fullName || "Someone";
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
