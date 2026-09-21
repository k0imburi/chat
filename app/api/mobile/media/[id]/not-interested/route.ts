import { NextResponse } from "next/server";
import { getMobileSessionFromRequest } from "@/lib/mobile-session";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getMobileSessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  const { id: mediaId } = await params;
  const media = await prisma.userMedia.findUnique({
    where: { id: mediaId },
    select: { id: true, userId: true },
  });
  if (!media) {
    return NextResponse.json(
      { success: false, message: "Post not found" },
      { status: 404 },
    );
  }
  if (media.userId === session.userId) {
    return NextResponse.json(
      { success: false, message: "You cannot hide your own post" },
      { status: 400 },
    );
  }

  await prisma.hiddenMedia.upsert({
    where: { userId_mediaId: { userId: session.userId, mediaId } },
    create: { userId: session.userId, mediaId },
    update: {},
  });

  return NextResponse.json({ success: true });
}
