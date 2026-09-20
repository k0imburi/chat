import { MediaKind } from "@prisma/client";
import { NextResponse } from "next/server";
import { getMobileSessionFromRequest } from "@/lib/mobile-session";
import { prisma } from "@/lib/prisma";
import { serializeMediaTags } from "@/lib/mobile-users";

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const targetUserId = searchParams.get("userId") || session.userId;
  const reposts = await prisma.mediaRepost.findMany({
    where: {
      userId: targetUserId,
      user: { isActive: true, status: { notIn: ["BLOCKED", "HIDDEN"] } },
      media: {
        user: { isActive: true, status: { notIn: ["BLOCKED", "HIDDEN"] } },
      },
    },
    orderBy: { createdAt: "desc" },
    include: { media: { include: { user: { include: { media: true } } } } },
  });

  const data = reposts
    .filter(
      ({ media }) =>
        !media.copyrightStatus && !media.reportStatus && !media.isHiddenByOwner,
    )
    .map(({ media, createdAt }) => {
      const profileMedia = media.user.media
        .filter(
          (item) =>
            item.kind === MediaKind.PROFILE_IMAGE ||
            item.kind === MediaKind.PROFILE_VIDEO,
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      const rawAvatar =
        media.user.avatarUrl ||
        profileMedia?.thumbnailUrl ||
        profileMedia?.url ||
        "";
      const avatarUrl = rawAvatar
        ? `${rawAvatar}${rawAvatar.includes("?") ? "&" : "?"}v=${media.user.updatedAt.getTime()}`
        : "";
      const mediaTags = serializeMediaTags(media);
      return {
        id: media.id,
        userId: media.userId,
        videoUrl: media.kind !== MediaKind.IMAGE ? media.url : "",
        imageUrl: media.kind === MediaKind.IMAGE ? media.url : "",
        images: media.images,
        thumbnailUrl: media.thumbnailUrl || media.url,
        title: media.title || "",
        caption: media.caption || "",
        description: media.description || "",
        ...mediaTags,
        views: media.views,
        likes: media.likes,
        commentCount: media.commentCount,
        shareCount: media.shareCount,
        repostCount: media.repostCount,
        bookmarkCount: media.saveCount,
        isReposted: true,
        resharedAt: createdAt.toISOString(),
        createdAt: media.createdAt.toISOString(),
        user: {
          userId: media.user.id,
          fullName: media.user.fullName,
          avatarUrl,
        },
      };
    });

  return NextResponse.json({ success: true, data });
}
