import { MediaKind } from "@prisma/client";
import { NextResponse } from "next/server";
import { getMobileSessionFromRequest } from "@/lib/mobile-session";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getMobileSessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  const reposts = await prisma.mediaRepost.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    include: { media: { include: { user: true } } },
  });

  const data = reposts
    .filter(({ media }) => !media.copyrightStatus && !media.reportStatus)
    .map(({ media, createdAt }) => ({
      id: media.id,
      userId: media.userId,
      videoUrl: media.kind !== MediaKind.IMAGE ? media.url : "",
      imageUrl: media.kind === MediaKind.IMAGE ? media.url : "",
      images: media.images,
      thumbnailUrl: media.thumbnailUrl || media.url,
      title: media.title || "",
      caption: media.caption || "",
      description: media.description || "",
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
        avatarUrl: media.user.avatarUrl || "",
      },
    }));

  return NextResponse.json({ success: true, data });
}
