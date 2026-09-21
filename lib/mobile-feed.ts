import "server-only";

import { prisma } from "@/lib/prisma";
import { serializeMobileUser } from "@/lib/mobile-users";
import { FEED_LIMIT } from "@/lib/discover-score";

export async function getFollowingFeed(userId: string) {
  const [follows, hiddenRows] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: userId },
      select: { followedId: true },
    }),
    prisma.hiddenMedia.findMany({
      where: { userId },
      select: { mediaId: true },
    }),
  ]);
  const hiddenMediaIds = new Set(hiddenRows.map((row) => row.mediaId));

  const followedIds = follows.map((f) => f.followedId);
  if (followedIds.length === 0) return [];

  const users = await prisma.user.findMany({
    where: {
      id: { in: followedIds },
      status: { notIn: ["BLOCKED", "HIDDEN"] },
    },
    include: { media: true },
  });

  const entries = users.flatMap((user) => {
    const serialized = serializeMobileUser(user);
    const gallery = Array.isArray(serialized.gallery)
      ? (serialized.gallery as Array<Record<string, unknown>>)
      : [];
    const { gallery: _g, ...userProfile } = serialized;
    return gallery
      .filter((video) => !hiddenMediaIds.has(String(video.id || "")))
      .map((video) => ({
        user: userProfile,
        video,
        _createdAt: new Date(String(video.createdAt || 0)).getTime(),
      }));
  });

  return entries
    .sort((a, b) => b._createdAt - a._createdAt)
    .slice(0, FEED_LIMIT)
    .map(({ user, video }) => ({ user, video }));
}
